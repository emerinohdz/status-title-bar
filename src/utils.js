/**
 * Utility functions
 */

/* Note : credit to the shellshape extension, from which these functions
 * are modified. https://extensions.gnome.org/extension/294/shellshape/
 * Signals are stored by the owner, storing both the target &
 * the id to clean up later.
 * 
 * Minor modifications by @emerino (we don't like obscure code)
 */
function connectAndTrack(owner, subject, name, cb) {
    if (!owner.hasOwnProperty('_GnomeShellExtension_bound_signals')) {
        owner._GnomeShellExtension_bound_signals = [];
    }

    let id = subject.connect(name, cb);
    owner._GnomeShellExtension_bound_signals.push([subject, id]);
}

function disconnectTrackedSignals(owner) {
    if (!owner || !owner._GnomeShellExtension_bound_signals) { 
        return; 
    }

    owner._GnomeShellExtension_bound_signals.forEach(
        function (sig) {
            let subject = sig[0];
            let id = sig[1];

            subject.disconnect(id);
        }
    );

    delete owner._GnomeShellExtension_bound_signals;
}