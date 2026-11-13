"""Tornado handlers for nbgrader student results web service."""

import contextlib
import glob
import json
import os
import traceback

from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.utils import url_path_join as ujoin
from tornado import escape, web
from traitlets.config import LoggingConfigurable

from ...apps import NbGrader
from ...auth import Authenticator
from ...coursedir import CourseDirectory
from ...exchange import ExchangeError, ExchangeFactory


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

    def load_config(self, config_dir=None):
        target_dir = os.path.abspath(config_dir or self._root_dir)
        app = NbGrader(config_dir=target_dir)
        app.load_cwd_config = False
        app.load_config_file()
        return app.config

    @contextlib.contextmanager
    def get_assignment_dir_config(self):
        config = self.load_config(self._root_dir)
        lister = ExchangeFactory(config=config).List(config=config)
        assignment_dir = lister.assignment_dir
        yield self.load_config(assignment_dir)

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
                    "value": "Failed to list courses.",
                }

    def _find_local_feedback(self, config, course_id, assignment_id, lister=None):
        coursedir_cfg = getattr(config, "CourseDirectory", None)
        assignment_dir = getattr(coursedir_cfg, "assignment_dir", ".") or "."
        path_includes_course = bool(getattr(coursedir_cfg, "path_includes_course", False))
        if lister is not None:
            assignment_dir = getattr(lister, "assignment_dir", assignment_dir) or assignment_dir
            path_includes_course = bool(getattr(lister, "path_includes_course", path_includes_course))

        candidates = []
        if path_includes_course:
            candidates.append(os.path.join(assignment_dir, course_id, assignment_id, "feedback"))
            candidates.append(os.path.join(self._root_dir, course_id, assignment_id, "feedback"))
        candidates.append(os.path.join(assignment_dir, assignment_id, "feedback"))
        candidates.append(os.path.join(self._root_dir, assignment_id, "feedback"))
        candidates.append(os.path.join(assignment_dir, course_id, assignment_id, "feedback"))
        candidates.append(os.path.join(self._root_dir, course_id, assignment_id, "feedback"))

        seen = set()
        for cand in candidates:
            abs_cand = os.path.abspath(cand)
            if abs_cand in seen:
                continue
            seen.add(abs_cand)
            if os.path.isdir(abs_cand):
                html_files = glob.glob(os.path.join(abs_cand, "**", "*.html"), recursive=True)
                if html_files:
                    try:
                        html_files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
                    except Exception:
                        html_files.sort(reverse=True)
                    latest_file = html_files[0]
                    try:
                        rel_file = os.path.relpath(latest_file, self._root_dir).replace("\\", "/")
                        rel_dir = os.path.relpath(os.path.dirname(latest_file), self._root_dir).replace("\\", "/")
                    except ValueError:
                        rel_file = latest_file.replace("\\", "/")
                        rel_dir = os.path.dirname(latest_file).replace("\\", "/")
                    return True, rel_dir, rel_file

        return False, None, None

    def fetch_feedback(self, course_id, assignment_id):
        if not course_id or not assignment_id:
            return {"success": False, "value": "Missing course_id or assignment_id."}
        course_id = str(course_id).strip()
        assignment_id = str(assignment_id).strip()
        with self.get_assignment_dir_config() as config:
            try:
                config.CourseDirectory.course_id = course_id
                config.CourseDirectory.assignment_id = assignment_id
                coursedir = CourseDirectory(config=config)
                authenticator = Authenticator(config=config)
                fetcher = ExchangeFactory(config=config).FetchFeedback(
                    coursedir=coursedir,
                    authenticator=authenticator,
                    config=config,
                )
                fetcher.start()
                return {"success": True}
            except Exception as e:
                self.log.error(traceback.format_exc())
                return {"success": False, "value": str(e)}

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

                augmented_assignments = []
                for item in response.get("assignments", []):
                    item_dict = dict(item)
                    asgn_id = item_dict.get("assignment_id", "")
                    has_local, feedback_path, feedback_file = self._find_local_feedback(
                        config, course_id, asgn_id, lister=lister
                    )
                    item_dict["has_local_feedback"] = has_local
                    item_dict["local_feedback_path"] = feedback_path
                    item_dict["local_feedback_file"] = feedback_file
                    augmented_assignments.append(item_dict)

                return {
                    "success": True,
                    "value": {
                        "course_id": response.get("course_id", course_id),
                        "student_id": response.get("student_id", ""),
                        "assignments": augmented_assignments,
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
                    "value": "Failed to load results.",
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


class ResultsFetchFeedbackHandler(BaseResultsHandler):

    @web.authenticated
    def post(self):
        try:
            data = escape.json_decode(self.request.body)
        except Exception:
            data = {}
        course_id = data.get("course_id") or self.get_argument("course_id", "")
        assignment_id = data.get("assignment_id") or self.get_argument("assignment_id", "")
        self.finish(json.dumps(self.manager.fetch_feedback(course_id, assignment_id)))


default_handlers = [
    (r"/results/courses", ResultsCoursesHandler),
    (r"/results/fetch_feedback", ResultsFetchFeedbackHandler),
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

