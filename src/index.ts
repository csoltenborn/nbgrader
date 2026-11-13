import { ILabShell, ILayoutRestorer, IRouter, JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { ICommandPalette, MainAreaWidget, WidgetTracker } from "@jupyterlab/apputils";
import { PageConfig, URLExt } from "@jupyterlab/coreutils";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { IMainMenu } from '@jupyterlab/mainmenu';
import { INotebookTracker } from "@jupyterlab/notebook";
import { ISettingRegistry } from "@jupyterlab/settingregistry";
import { ServerConnection } from "@jupyterlab/services";
import { INotebookShell } from "@jupyter-notebook/application";
import { INotebookTree } from "@jupyter-notebook/tree";
import { Menu, Panel, Widget } from '@lumino/widgets';

import { AssignmentListWidget } from "./assignment_list/index";
import { ResultsWidget } from "./results/index";
import { FormgraderWidget } from "./formgrader/index";
import { CourseListWidget } from "./course_list/index";
import { CreateAssignmentWidget } from "./create_assignment/index";
import { ButtonExtension } from "./validate_assignment/index";

/**
 * The plugin IDs
 */
const pluginIDs = {
  menus: '@jupyter/nbgrader:menu',
  assignmentsList: '@jupyter/nbgrader:assignment-list',
  results: '@jupyter/nbgrader:results',
  coursesList: '@jupyter/nbgrader:course-list',
  formgrader: '@jupyter/nbgrader:formgrader',
  createAssignment: '@jupyter/nbgrader:create-assignment',
  validateAssignment: '@jupyter/nbgrader:validate-assignment'
}

/**
 * The command IDs
 */
export const commandIDs = {
  openAssignmentsList: 'nbgrader:open-assignment-list',
  openResults: 'nbgrader:open-results',
  openCoursesList: 'nbgrader:open-course-list',
  openFormgrader: 'nbgrader:open-formgrader',
  openFormgraderLocal: 'nbgrader:open-formgrader-local',
  openCreateAssignment: 'nbgrader:open-create-assignment'
}

/**
 * Manage the extensions available in Notebook.
 */
const availableExtensionsManager: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.menus,
  autoStart: true,
  requires: [IMainMenu],
  optional: [ICommandPalette, ILabShell, INotebookShell],
  activate: (
    app: JupyterFrontEnd,
    mainMenu: IMainMenu,
    palette: ICommandPalette | null,
    labShell: ILabShell | null,
    notebookShell: INotebookShell | null
  ) => {

    let mainExtensions = false;
    let createExtension = false;
    if (notebookShell) {
      const page = PageConfig.getOption('notebookPage');
      if (page === 'tree') {
        mainExtensions = true;
      } else if (page === 'notebooks') {
        createExtension = true;
      }
    }

    if (!(labShell || mainExtensions || createExtension)) {
      return
    }

    const nbgraderMenu = new Menu({ commands: app.commands });
    nbgraderMenu.id = 'jp-mainmenu-nbgrader';
    nbgraderMenu.title.label = 'Nbgrader';

    const hasCmd = (command: string) => app.commands.hasCommand(command);

    const addCommand = (command: string) => {
      nbgraderMenu.addItem({ command: command });
      if (palette) palette.addItem({ command: command, category: 'nbgrader' });
    };

    app.restored.then(() => {
      if (mainExtensions || labShell) {
        if (hasCmd(commandIDs.openAssignmentsList)) addCommand(commandIDs.openAssignmentsList);
        if (hasCmd(commandIDs.openResults)) addCommand(commandIDs.openResults);
        if (hasCmd(commandIDs.openFormgrader)) addCommand(commandIDs.openFormgrader);
        if (hasCmd(commandIDs.openFormgraderLocal)) addCommand(commandIDs.openFormgraderLocal);
      }

      if (createExtension || labShell) {
        if (hasCmd(commandIDs.openCreateAssignment)) addCommand(commandIDs.openCreateAssignment);
      }
    });

    mainMenu.addMenu(nbgraderMenu);
  }
}

/**
 * Assignment list plugin.
 */
const assignmentListExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.assignmentsList,
  autoStart: true,
  optional: [ILayoutRestorer, INotebookTree],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer | null,
    notebookTree: INotebookTree | null
  ) => {

    // Declare a widget variable
    let widget: MainAreaWidget<AssignmentListWidget>;

    // Track the widget state
    let tracker = new WidgetTracker<MainAreaWidget<AssignmentListWidget>>({
      namespace: 'nbgrader-assignment-list'
    });

    app.commands.addCommand(commandIDs.openAssignmentsList, {
      label: 'Assignment List',
      execute: () => {
        if (!widget || widget.isDisposed) {
          const content = new AssignmentListWidget(app);
          widget = new MainAreaWidget({ content });
          widget.id = 'nbgrader-assignment-list';
          widget.addClass('nbgrader-mainarea-widget');
          widget.title.label = 'Assignments';
          widget.title.closable = true;
        }
        if (!tracker.has(widget)) {
          // Track the state of the widget for later restoration
          tracker.add(widget);
        }

        // Attach the widget to the main area if it's not there
        if (!widget.isAttached) {
          if (notebookTree) {
            notebookTree.addWidget(widget);
            notebookTree.currentWidget = widget;
          }
          else app.shell.add(widget, 'main');
        }

        widget.content.update();

        app.shell.activateById(widget.id);
      }
    });

    // Restore the widget state
    if (restorer != null) {
      restorer.restore(tracker, {
        command: commandIDs.openAssignmentsList,
        name: () => 'nbgrader-assignment-list'
      });
    }

    const addCourseBadge = async () => {
      try {
        const settings = ServerConnection.makeSettings();
        const requestUrl = URLExt.join(settings.baseUrl, 'nbgrader_context');
        const response = await ServerConnection.makeRequest(requestUrl, {}, settings);
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        const courseId = data.course_id || 'None';
        const rawRole = (data.role || 'student').toLowerCase();
        const role = rawRole.charAt(0).toUpperCase() + rawRole.slice(1);

        const badgeWidget = new Widget();
        badgeWidget.id = 'nbgrader-course-badge';
        badgeWidget.addClass('nbgrader-course-badge');
        badgeWidget.node.style.display = 'flex';
        badgeWidget.node.style.alignItems = 'center';
        badgeWidget.node.style.padding = '0 10px';
        badgeWidget.node.style.fontSize = 'var(--jp-ui-font-size1, 13px)';
        badgeWidget.node.style.color = 'var(--jp-ui-font-color1)';

        const badgeText = document.createElement('span');
        badgeText.className = 'nbgrader-course-badge-text';
        badgeText.innerText = `Course: ${courseId} (${role})`;
        badgeText.style.marginRight = '8px';
        badgeWidget.node.appendChild(badgeText);

        const switchLink = document.createElement('a');
        switchLink.href = '/hub/logout';
        switchLink.className = 'nbgrader-switch-course-link';
        switchLink.title = 'Log out and select another course';
        switchLink.innerText = 'Switch Course';
        switchLink.style.color = 'var(--jp-brand-color1, #1976d2)';
        switchLink.style.textDecoration = 'underline';
        badgeWidget.node.appendChild(switchLink);

        app.shell.add(badgeWidget, 'top', { rank: 900 });
      } catch (err) {
        console.warn('Failed to load nbgrader context badge', err);
      }
    };
    addCourseBadge();

    console.debug('JupyterLab extension assignment-list is activated!');
  }
};

/**
 * Student results plugin.
 */
const resultsExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.results,
  autoStart: true,
  optional: [ILayoutRestorer, INotebookTree],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer | null,
    notebookTree: INotebookTree | null
  ) => {
    let widget: MainAreaWidget<ResultsWidget>;

    const tracker = new WidgetTracker<MainAreaWidget<ResultsWidget>>({
      namespace: 'nbgrader-results'
    });

    app.commands.addCommand(commandIDs.openResults, {
      label: 'Results',
      execute: () => {
        const isNew = !widget || widget.isDisposed;
        if (isNew) {
          const content = new ResultsWidget(app);
          widget = new MainAreaWidget({ content });
          widget.id = 'nbgrader-results';
          widget.addClass('nbgrader-mainarea-widget');
          widget.title.label = 'Results';
          widget.title.closable = true;
        }
        if (!tracker.has(widget)) {
          tracker.add(widget);
        }

        if (!widget.isAttached) {
          if (notebookTree) {
            notebookTree.addWidget(widget);
            notebookTree.currentWidget = widget;
          } else {
            app.shell.add(widget, 'main');
          }
        } else {
          widget.content.update();
        }

        app.shell.activateById(widget.id);
      }
    });

    if (restorer != null) {
      restorer.restore(tracker, {
        command: commandIDs.openResults,
        name: () => 'nbgrader-results'
      });
    }

    console.debug('JupyterLab extension results is activated!');
  }
};

/**
 * Courses list plugin.
 */
const courseListExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.coursesList,
  autoStart: true,
  optional: [ILayoutRestorer, INotebookTree],
  activate: (
    app: JupyterFrontEnd,
    restorer: ILayoutRestorer | null,
    notebookTree: INotebookTree | null
  ) => {

    let widget: MainAreaWidget<CourseListWidget>;

    // Track the widget state
    let tracker = new WidgetTracker<MainAreaWidget<CourseListWidget>>({
      namespace: 'nbgrader-course-list'
    });

    app.commands.addCommand(commandIDs.openCoursesList, {
      label: 'Course List',
      execute: () => {
        if (!widget || widget.isDisposed) {
          const content = new CourseListWidget(app, notebookTree !== null);
          widget = new MainAreaWidget({ content });
          widget.id = 'nbgrader-course-list';
          widget.addClass('nbgrader-mainarea-widget');
          widget.title.label = 'Courses';
          widget.title.closable = true;
        }
        if (!tracker.has(widget)) {
          tracker.add(widget);
        }

        // Attach the widget to the main area if it's not there
        if (!widget.isAttached) {
          if (notebookTree) {
            notebookTree.addWidget(widget);
            notebookTree.currentWidget = widget;
          }
          else app.shell.add(widget, 'main');
        }

        widget.content.update();

        app.shell.activateById(widget.id);
      }
    })

    // Restore the widget state
    if (restorer != null) {
      restorer.restore(tracker, {
        command: commandIDs.openCoursesList,
        name: () => 'nbgrader-course-list'
      });
    }

    console.debug('JupyterLab extension course-list is activated!');
  }
};

/**
 * Formgrader extension.
 */
const formgraderExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.formgrader,
  autoStart: true,
  optional: [
    IDefaultFileBrowser,
    ILayoutRestorer,
    INotebookTree,
    IRouter,
    ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    defaultFileBrowser: IDefaultFileBrowser,
    restorer: ILayoutRestorer | null,
    notebookTree: INotebookTree | null,
    router: IRouter | null,
    settings: ISettingRegistry | null
  ) => {
    // Declare a widget variable
    let widget: MainAreaWidget<FormgraderWidget>;

    // Whether formgrader can load the local settings or not
    let localConfig = false;

    // Track the widget state
    let tracker = new WidgetTracker<MainAreaWidget<FormgraderWidget>>({
      namespace: 'nbgrader-formgrader'
    });

    const openFormgrader = (url: string) => {
      if (!widget || widget.isDisposed) {
        const content = new FormgraderWidget(app, url);

        widget = new MainAreaWidget({ content });
        widget.id = 'formgrader';
        widget.title.label = 'Formgrader';
        widget.title.closable = true;
      }

      if (!tracker.has(widget)) {
        // Track the state of the widget for later restoration
        tracker.add(widget);
      }

      // Attach the widget to the main area if it's not there
      if (notebookTree) {
        if (!widget.isAttached) {
          notebookTree.addWidget(widget);
        }
        notebookTree.currentWidget = widget;
      } else if (!widget.isAttached) {
        app.shell.add(widget, 'main');
      }

      widget.content.update();

      app.shell.activateById(widget.id);
    }

    // Command to open formgrader
    app.commands.addCommand(commandIDs.openFormgrader, {
      label: 'Formgrader',
      execute: args => {
        const settings = ServerConnection.makeSettings();
        let url = (args.url as string) || URLExt.join(settings.baseUrl, 'formgrader');
        openFormgrader(url);
      }
    });

    // Command to open formgrader using local configuration file
    app.commands.addCommand(commandIDs.openFormgraderLocal, {
      label: 'Formgrader (local)',
      isVisible: () => localConfig,
      execute: args => {
        let path = ''
        if (defaultFileBrowser) {
          path = encodeURIComponent(defaultFileBrowser.model.path);
        }
        const settings = ServerConnection.makeSettings();
        let url = (args.url as string) || URLExt.join(settings.baseUrl, 'formgrader');
        if (path) {
          url += `?path=${path}`;
        }
        openFormgrader(url);
      }
    });

    /**
     * Load the settings for this extension
     */
    function loadSetting(setting: ISettingRegistry.ISettings): void {
      // Read the settings and convert to the correct type
      localConfig = setting.get('local_config').composite as boolean;

      // Notify the command that the setting has been reloaded
      app.commands.notifyCommandChanged(commandIDs.openFormgraderLocal);
    }

    // Wait for the application to be restored and
    // for the settings for this plugin to be loaded
    Promise.all([app.restored, settings.load(pluginIDs.formgrader)])
      .then(([, setting]) => {
        // Read the settings
        loadSetting(setting);
        // Listen for your plugin setting changes
        setting.changed.connect(loadSetting);
      });

    // Open formgrader from URL.
    if (router) {
      const formgraderPattern = /(\?|&)formgrader=true/;
      router.register({
        command: commandIDs.openFormgrader,
        pattern: formgraderPattern
      });
    }

    // Restore the widget state
    if (restorer != null) {
      restorer.restore(tracker, {
        command: commandIDs.openFormgrader,
        name: () => 'nbgrader-formgrader'
      });
    }
    console.debug('JupyterLab extension formgrader is activated!');
  }
};

/**
 * Create assignment plugin.
 */
const createAssignmentExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.createAssignment,
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ILabShell],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    labShell: ILabShell | null
  ) => {
    const panel = new Panel();
    panel.node.style.overflowY = 'auto';
    const createAssignmentWidget = new CreateAssignmentWidget(tracker, labShell);
    panel.addWidget(createAssignmentWidget);
    panel.id = 'nbgrader-create_assignment';
    panel.title.label = 'Create Assignment';
    panel.title.caption = 'Nbgrader Create Assignment';

    app.shell.add(panel, 'right');

    app.commands.addCommand(commandIDs.openCreateAssignment, {
      label: 'Edit Assignment Cells',
      isEnabled: () => {
        return createAssignmentWidget.isAvailable();
      },
      execute: () => {
        app.shell.activateById(panel.id);
      }
  });

tracker.currentChanged.connect(() => {
  app.commands.notifyCommandChanged(commandIDs.openCreateAssignment);
});
if (labShell) {
  labShell.currentChanged.connect(() => {
    app.commands.notifyCommandChanged(commandIDs.openCreateAssignment);
  });
}
console.debug('Extension "create_assignment" activated.');
  }
};


/**
 * Validate assignment plugin.
 */
const validateAssignmentExtension: JupyterFrontEndPlugin<void> = {
  id: pluginIDs.validateAssignment,
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd) => {
    app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
    console.debug('JupyterLab extension validate-assignment is activated!');
  }
};

export default [
  availableExtensionsManager,
  formgraderExtension,
  assignmentListExtension,
  resultsExtension,
  courseListExtension,
  createAssignmentExtension,
  validateAssignmentExtension
]
