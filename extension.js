/**
 * StatusTitleBar extension
 * @autor: emerino <emerino at gmail dot com>

 * Some code reused (and some stolen) from ui.panel script.
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
const Signals = imports.signals;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Overview = imports.ui.overview;

const PANEL_ICON_SIZE = 24;

/** Utility functions **/
/* Note : credit to the shellshape extension, from which these functions
 * are modified. https://extensions.gnome.org/extension/294/shellshape/
 * Signals are stored by the owner, storing both the target &
 * the id to clean up later.
 * 
 * Minor modifications by @emerino (we don't like obscure code)
 */
function connectAndTrack(owner, subject, name, cb) {
    if (!owner.hasOwnProperty('_StatusTitleBar_bound_signals')) {
        owner._StatusTitleBar_bound_signals = [];
    }

    let id = subject.connect(name, cb);
    owner._StatusTitleBar_bound_signals.push([subject, id]);
}

function disconnectTrackedSignals(owner) {
    if (!owner || !owner._StatusTitleBar_bound_signals) { 
        return; 
    }

    owner._StatusTitleBar_bound_signals.forEach(
        function (sig) {
            let subject = sig[0];
            let id = sig[1];
            
            subject.disconnect(id);
        }
    );
        
    delete owner._StatusTitleBar_bound_signals;
}

/**
 * StatusTitleBarButton
 *
 * This class manages the current title of focused maximized window and shows
 * it in the status title bar of the panel.
 *
 */
const StatusTitleBarButton = new Lang.Class({
    Name: 'StatusTitleBarButton',
    Extends: Panel.AppMenuButton,

    _init: function(panel) {
        this.parent(panel);

        this._targetIsCurrent = false;

        /*** Holders for local tracked signals ***/
        this._wsSignals = {};
        //this._targetAppSignals = {};

        connectAndTrack(this, global.window_manager, 'maximize',
                Lang.bind(this, this._onRedimension));
        connectAndTrack(this, global.window_manager, 'unmaximize',
                Lang.bind(this, this._onRedimension));
  
        connectAndTrack(this, global.screen, 'notify::n-workspaces',
                Lang.bind(this, this._changeWorkspaces));

        connectAndTrack(this, global.display, "notify::focus-window",
                Lang.bind(this, this._sync));

        // if actor is destroyed, we must disconnect.
        connectAndTrack(this, this.actor, 'destroy', Lang.bind(this, this.destroy));

  		this._changeWorkspaces();
    },

    _sync: function() {
        /* Added */
		let win = global.display.focus_window;

        if (!win) {
            return;
        }

        this.parent();
        
		if (!win._notifyTitleId) {
			this._initWindow(win);
		}

        let targetApp = this._findTargetApp();
		this._changeTitle(win, targetApp)
        /* End added */
    },
    
 	_changeWorkspaces: function() {
        disconnectTrackedSignals(this._wsSignals);
        
 		for ( let i = 0; i < global.screen.n_workspaces; ++i ) {
             let ws = global.screen.get_workspace_by_index(i);
             
             connectAndTrack(this._wsSignals, ws, 'window-removed',
                     Lang.bind(this, this._sync));
         }
 	},

 	_initWindow: function(win) {
 		if (win._notifyTitleId) {
 			win.disconnect(win._notifyTitleId);
 		}
 
 		win._notifyTitleId = win.connect("notify::title", Lang.bind(this, this._onTitleChanged));
 	},

 	_onTitleChanged: function(win) {
 		if (win.has_focus()) {
 			let tracker = Shell.WindowTracker.get_default();
 			let app = tracker.get_window_app(win);
 
 			this._changeTitle(win, app);
 		}
 	},
 
 	_changeTitle: function(win, app) {
 		this._label.setText("");
 		let maximizedFlags = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;
 
 		if (win.get_maximized() == maximizedFlags) {
 			this._label.setText(win.title);
 		} else {
 			this._label.setText(app.get_name());
 		}
 	},
 
 	_onRedimension: function(shellwm, actor) {
 		let win = actor.get_meta_window();
 
 		this._onTitleChanged(win);
 	},
    /** Add a 'destroy' method that disconnects all the signals
     * (the actual AppMenu.Button class in panel.js doesn't do this!)
     */
    destroy: function () {
        // disconnect signals
        disconnectTrackedSignals(this);

        // any signals from _changeWorkspaces
        disconnectTrackedSignals(this._wsSignals);

        // any signals from _initWindow. _sync requires the _notifyTitleId.
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; ++i) {
            let win = windows[i];
            if (win._notifyTitleId) {
                win.disconnect(win._notifyTitleId);
                delete win._notifyTitleId;
            }
        }

        // Call parent destroy.
        this.parent();
    }
});

Signals.addSignalMethods(StatusTitleBarButton.prototype);


const StatusTitleBar = new Lang.Class({
    Name: 'StatusTitleBar',

    _init: function(panel) {
        this.panel = panel;
        this.statusArea = panel.statusArea;
        this.appMenu = this.statusArea.appMenu; // keep a reference to the default AppMenuButton
        
        this.button = null;
    }, 

    enable: function() {
        this.button = new StatusTitleBarButton(this.panel);
        
        this.panel._leftBox.remove_actor(this.appMenu.actor.get_parent())
        
        this.statusArea.appMenu = this.button;
        let index = this.panel._leftBox.get_children().length;
        this.panel._leftBox.insert_child_at_index(this.button.actor.get_parent(), index);
    },

    disable: function() {
        this.panel.menuManager.removeMenu(this.button.menu);
        this.panel._leftBox.remove_actor(this.button.actor.get_parent());
        this.button.destroy();
        
        this.statusArea.appMenu = this.appMenu;
        let index = Main.panel._leftBox.get_children().length;
        Main.panel._leftBox.insert_child_at_index(this.appMenu.actor.get_parent(), index);
        
        this.button = null;
    }
});

// lightweight object, acts only as a holder when ext disabled
let statusTitleBar = null; 

function init() {
    let panel = Main.panel;
    statusTitleBar = new StatusTitleBar(panel);
}

function enable() {
    statusTitleBar.enable();
}

function disable() {
    statusTitleBar.disable();
    
}
