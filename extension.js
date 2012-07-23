/**
 * StatusTitleBar extension
 * v0.2
 *
 * This extension replaces the original AppMenuButton from the
 * gnome-shell panel with a new AppMenuButton that shows the
 * title of the current focused window, when maximized, instead 
 * of the application's name. If the focused window is not
 * maximized then it reverts to showing the application's name.
 *
 */

const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Util = imports.misc.util;

const Shell = imports.gi.Shell;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const Tweener = imports.ui.tweener;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Overview = imports.ui.overview;

const PANEL_ICON_SIZE = 24;

/** Utility functions **/
/* Note : credit to the shellshape extension, from which these functions
 * are modified. https://extensions.gnome.org/extension/294/shellshape/
 * Signals are stored by the owner, storing both the target &
 * the id to clean up later.
 */
function connectAndTrack(owner, subject, name, cb) {
    if (!owner.hasOwnProperty('_StatusTitleBar_bound_signals')) {
        owner._StatusTitleBar_bound_signals = [];
    }
    owner._StatusTitleBar_bound_signals.push([subject, subject.connect(name, cb)]);
}

function disconnectTrackedSignals(owner) {
    if (!owner || !owner._StatusTitleBar_bound_signals) { return; }
    owner._StatusTitleBar_bound_signals.map(
        function (sig) {
            sig[0].disconnect(sig[1]);
        }
    );
    delete owner._StatusTitleBar_bound_signals;
}

/** Extension code **/
let storage = {};
function init() {
}

function enable() {
    // laziness
    let AppMenuButton = Panel.AppMenuButton.prototype;

    /* Do monkey patching */
 	AppMenuButton._onTitleChanged = function(win) {
 		if (win.has_focus()) {
 			let tracker = Shell.WindowTracker.get_default();
 			let app = tracker.get_window_app(win);
 			this._changeTitle(win, app);
 		}
 	};
 
 	AppMenuButton._changeTitle = function(win, app) {
 		this._label.setText("");
 		let maximizedFlags = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;
 		if (win.get_maximized() == maximizedFlags) {
 			this._label.setText(win.title);
 		} else {
 			this._label.setText(app.get_name());
 		}
 	};
 
 	AppMenuButton._onMaximize = function(shellwm, actor) {
 		let win = actor.get_meta_window();
 		this._onTitleChanged(win);
 	};
 
 	AppMenuButton._onUnmaximize = function(shellwm, actor) {
 		let win = actor.get_meta_window();
 		this._onTitleChanged(win);
 	};
 
 	AppMenuButton._windowAdded = function(metaWorkspace, metaWindow) {
 		this._initWindow(metaWindow);
    };
 
    AppMenuButton._windowRemoved = function(metaWorkspace, metaWindow) {
 		if (metaWorkspace == global.screen.get_active_workspace()) {
 			this._sync();
 		}
    };
 
 	AppMenuButton._changeWorkspaces = function() {
 		for ( let i=0; i < global.screen.n_workspaces; ++i ) {
             let ws = global.screen.get_workspace_by_index(i);
 			if (ws._windowRemovedId) {
 				ws.disconnect(ws._windowRemovedId);
 			}
             ws._windowRemovedId = ws.connect('window-removed',
                                     Lang.bind(this, this._windowRemoved));
         }
    };
 
 	AppMenuButton._initWindow = function(win) {
 		if (win._notifyTitleId) {
 			win.disconnect(win._notifyTitleId);
 		}
 		win._notifyTitleId = win.connect("notify::title", Lang.bind(this, this._onTitleChanged));
 	};

    /** Add a 'destroy' method that disconnects all the signals
     * (the actual AppMenu.Button class in panel.js doesn't do this!)
     */
    AppMenuButton.destroy = function () {
        // disconnect signals
        this.disconnectTrackedSignals(this);
        // Call parent destroy.
        this.parent();
    };

    /* __init:
     * - menu.actor ('bin'): name change to 'windowTitle'
     * - don't call _sync: replace with a whole bunch of connects
     * - track all global connected signals so we can disconnect later.
     *
     * _sync:
     * added _changeWindowTitle
     * removed a few SetText
     */
    storage._sync = AppMenuButton._sync;
    storage._init = AppMenuButton._init;
   
    AppMenuButton._init = function(menuManager) {
        /* This is the same as AppMenuButton._init except for the very last line,
         * which was this._sync().
         */
        this.parent(0.0, null, true);

        this.actor.accessible_role = Atk.Role.MENU;

        this._startingApps = [];

        this._menuManager = menuManager;
        this._targetApp = null;
        this._appMenuNotifyId = 0;
        this._actionGroupNotifyId = 0;

        let bin = new St.Bin({ name: 'windowTitle' });
        this.actor.add_actor(bin);

        this.actor.bind_property("reactive", this.actor, "can-focus", 0);
        this.actor.reactive = false;
        this._targetIsCurrent = false;

        this._container = new Shell.GenericContainer();
        bin.set_child(this._container);
        this._container.connect('get-preferred-width', Lang.bind(this, this._getContentPreferredWidth));
        this._container.connect('get-preferred-height', Lang.bind(this, this._getContentPreferredHeight));
        this._container.connect('allocate', Lang.bind(this, this._contentAllocate));

        this._iconBox = new Shell.Slicer({ name: 'appMenuIcon' });
        this._iconBox.connect('style-changed',
                              Lang.bind(this, this._onIconBoxStyleChanged));
        this._iconBox.connect('notify::allocation',
                              Lang.bind(this, this._updateIconBoxClip));
        this._container.add_actor(this._iconBox);
        this._label = new Panel.TextShadower();
        this._container.add_actor(this._label.actor);

        this._iconBottomClip = 0;

        this._visible = !Main.overview.visible;
        if (!this._visible)
            this.actor.hide();

        /* Track all globally connected signals ! */
        connectAndTrack(this, Main.overview, 'hiding', Lang.bind(this, function () {
            this.show();
        }));
        connectAndTrack(this, Main.overview, 'showing', Lang.bind(this, function () {
            this.hide();
        }));

        this._stop = true;

        this._spinner = new Panel.AnimatedIcon('process-working.svg',
                                         PANEL_ICON_SIZE);
        this._container.add_actor(this._spinner.actor);
        this._spinner.actor.lower_bottom();

        let tracker = Shell.WindowTracker.get_default();
        let appSys = Shell.AppSystem.get_default();
        connectAndTrack(this, tracker, 'notify::focus-app',
                Lang.bind(this, this._focusAppChanged));
        connectAndTrack(this, appSys, 'app-state-changed',
                Lang.bind(this, this._onAppStateChanged));

        connectAndTrack(this, global.window_manager, 'switch-workspace',
                Lang.bind(this, this._sync));

        /*** This is what this._sync() in the original _init is replaced with ***/
        connectAndTrack(this, global.window_manager, 'maximize',
                Lang.bind(this, this._onMaximize));
        connectAndTrack(this, global.window_manager, 'unmaximize',
                Lang.bind(this, this._onUnmaximize));
  
        connectAndTrack(this, global.screen, 'notify::n-workspaces',
                Lang.bind(this, this._changeWorkspaces));
  
        this._changeWorkspaces();
    };

    AppMenuButton._sync = function() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        let lastStartedApp = null;
        let workspace = global.screen.get_active_workspace();
        for (let i = 0; i < this._startingApps.length; i++)
            if (this._startingApps[i].is_on_workspace(workspace))
                lastStartedApp = this._startingApps[i];

        let targetApp = focusedApp != null ? focusedApp : lastStartedApp;

        if (targetApp == null) {
            if (!this._targetIsCurrent)
                return;

            this.actor.reactive = false;
            this._targetIsCurrent = false;

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, { opacity: 0,
                                           time: Overview.ANIMATION_TIME,
                                           transition: 'easeOutQuad' });
            return;
        }

        if (!targetApp.is_on_workspace(workspace))
            return;

        if (!this._targetIsCurrent) {
            this.actor.reactive = true;
            this._targetIsCurrent = true;

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, { opacity: 255,
                                           time: Overview.ANIMATION_TIME,
                                           transition: 'easeOutQuad' });
        }

        /* Added */
        let win = global.display.focus_window;

        if (!win._notifyTitleId) {
            this._initWindow(win);
        }

        this._changeTitle(win, targetApp)
        /* End added */

        if (targetApp == this._targetApp) {
            if (targetApp && targetApp.get_state() != Shell.AppState.STARTING) {
                this.stopAnimation();
                this._maybeSetMenu();
            }
            return;
        }

        this._spinner.actor.hide();
        if (this._iconBox.child != null)
            this._iconBox.child.destroy();
        this._iconBox.hide();
        //this._label.setText('');

        if (this._appMenuNotifyId)
            this._targetApp.disconnect(this._appMenuNotifyId);
        if (this._actionGroupNotifyId)
            this._targetApp.disconnect(this._actionGroupNotifyId);
        if (targetApp) {
            this._appMenuNotifyId = targetApp.connect('notify::menu', Lang.bind(this, this._sync));
            this._actionGroupNotifyId = targetApp.connect('notify::action-group', Lang.bind(this, this._sync));
        } else {
            this._appMenuNotifyId = 0;
            this._actionGroupNotifyId = 0;
        }

        this._targetApp = targetApp;
        let icon = targetApp.get_faded_icon(2 * PANEL_ICON_SIZE);

        //this._label.setText(targetApp.get_name());
        this.setName(targetApp.get_name());

        this._iconBox.set_child(icon);
        this._iconBox.show();

        if (targetApp.get_state() == Shell.AppState.STARTING)
            this.startAnimation();
        else
            this._maybeSetMenu();

        this.emit('changed');
    };
}


function disable() {
    let AppMenuButton = Panel.AppMenuButton.prototype;

    AppMenuButton._sync = storage._sync;
    AppMenuButton._init = storage._init;
    storage = {};

   /* Undo monkey patching */
    AppMenuButton._onTitleChanged  = null;
 	AppMenuButton._changeTitle  = null;
 	AppMenuButton._onMaximize  = null;
 	AppMenuButton._onUnmaximize  = null;
 	AppMenuButton._windowAdded  = null;
    AppMenuButton._windowRemoved  = null;
 	AppMenuButton._changeWorkspaces  = null;
 	AppMenuButton._initWindow  = null;
}

