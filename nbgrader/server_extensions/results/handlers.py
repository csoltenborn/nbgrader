"""Tornado handlers for nbgrader student results web service."""

import contextlib
import json
import os
import traceback

from jupyter_core.paths import jupyter_config_path
from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.utils import url_path_join as ujoin
from tornado import web
from traitlets.config import LoggingConfigurable

from ...apps import NbGrader
from ...auth import Authenticator
from ...coursedir import CourseDirectory
from ...exchange import ExchangeError, ExchangeFactory


@contextlib.contextmanager
def chdir(dirname):
    currdir = os.getcwd()
    os.chdir(dirname)
    try:
        yield
    finally:
        os.chdir(currdir)


class ResultsManager(LoggingConfigurable):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._root_dir = os.getcwd()

    @property
    def root_dir(self):
        return self._root_dir

    @root_dir.setter
    def root_dir(self, directory):
        self._root_dir = directory

    def load_config(self):
        paths = jupyter_config_path()
        paths.insert(0, os.getcwd())
        app = NbGrader()
        app.config_file_paths.append(paths)
        app.load_config_file()
        return app.config

    @contextlib.contextmanager
    def get_assignment_dir_config(self):
        with chdir(self._root_dir):
            config = self.load_config()

        lister = ExchangeFactory(config=config).List(config=config)
        assignment_dir = lister.assignment_dir

        with chdir(assignment_dir):
            app = NbGrader()
            app.config_file_paths.append(os.getcwd())
            app.load_config_file()
            yield app.config

    def _create_lister(self, config, course_id=None):
        if course_id:
            config.CourseDirectory.course_id = course_id
        coursedir = CourseDirectory(config=config)
        authenticator = Authenticator(config=config)
        return ExchangeFactory(config=config).List(
            coursedir=coursedir,
            authenticator=authenticator,
            config=config,
        )

    def list_courses(self):
        with self.get_assignment_dir_config() as config:
            try:
                selected = os.environ.get("NBGRADER_SELECTED_COURSE", "").strip()
                if selected:
                    return {"success": True, "value": [selected]}

                configured_course = getattr(config.CourseDirectory, "course_id", "") or ""
                if isinstance(configured_course, str):
                    configured_course = configured_course.strip()
                else:
                    configured_course = ""

                if configured_course and configured_course != "*":
                    return {"success": True, "value": [configured_course]}

                lister = self._create_lister(config)
                if hasattr(lister, "_get_courses"):
                    courses = lister._get_courses()
                    if courses is None:
                        return {
                            "success": False,
                            "value": "Failed to query courses from exchange.",
                        }
                    return {"success": True, "value": sorted(set(courses))}

                assignments = lister.start()
                courses = sorted({x["course_id"] for x in assignments})
                return {"success": True, "value": courses}
            except Exception as e:
                self.log.error(traceback.format_exc())
                if isinstance(e, ExchangeError):
                    return {
                        "success": False,
                        "value": "The exchange is not available.",
                    }
                return {
                    "success": False,
                    "value": traceback.format_exc(),
                }

    def get_results(self, course_id):
        if not course_id or not str(course_id).strip():
            return {"success": False, "value": "No course specified."}

        course_id = str(course_id).strip()
        with self.get_assignment_dir_config() as config:
            try:
                lister = self._create_lister(config, course_id=course_id)
                if not hasattr(lister, "get_student_results"):
                    return {
                        "success": False,
                        "value": "Point evaluation is not supported by the configured exchange.",
                    }
                response = lister.get_student_results(course_id)
                if response is None or not response.get("success", False):
                    msg = (
                        response.get("message")
                        if isinstance(response, dict) and response.get("message")
                        else f"Failed to load results for course '{course_id}'."
                    )
                    return {"success": False, "value": msg}

                return {
                    "success": True,
                    "value": {
                        "course_id": response.get("course_id", course_id),
                        "student_id": response.get("student_id", ""),
                        "assignments": response.get("assignments", []),
                        "total_points": response.get("total_points", 0.0),
                        "total_max_points": response.get("total_max_points", 0.0),
                        "percentage": response.get("percentage", 0.0),
                        "bonus": response.get("bonus"),
                    },
                }
            except Exception:
                self.log.error(traceback.format_exc())
                return {
                    "success": False,
                    "value": traceback.format_exc(),
                }


class BaseResultsHandler(JupyterHandler):

    @property
    def manager(self):
        return self.settings["results_manager"]


class ResultsCoursesHandler(BaseResultsHandler):

    @web.authenticated
    def get(self):
        self.finish(json.dumps(self.manager.list_courses()))


class ResultsHandler(BaseResultsHandler):

    @web.authenticated
    def get(self):
        course_id = self.get_argument("course_id", "")
        self.finish(json.dumps(self.manager.get_results(course_id)))


default_handlers = [
    (r"/results/courses", ResultsCoursesHandler),
    (r"/results", ResultsHandler),
]


def load_jupyter_server_extension(nbapp):
    """Load the results nbgrader server extension."""
    nbapp.log.info("Loading the results nbgrader serverextension")
    webapp = nbapp.web_app
    manager = ResultsManager(parent=nbapp)
    manager.root_dir = nbapp.root_dir
    webapp.settings["results_manager"] = manager

    base_url = webapp.settings["base_url"]
    webapp.add_handlers(
        ".*$",
        [(ujoin(base_url, pat), handler) for pat, handler in default_handlers],
    )

