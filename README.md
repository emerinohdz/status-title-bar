# Status Title Bar

Gnome-Shell extension that shows the current focused window's title in the
status panel when maximized. It replaces the current AppButton that shows the
current focused application's name by default. If the current focused window is
not maximized, then it falls back to showing the focused applications name.

# Installation

*You need to have NodeJS (npm) for all of the following to work:*

First step is to download source code and build dependencies:

    git clone git@github.com:emerinohdz/PowerAltTab.git && cd PowerAltTab
    npm install

There are two ways to install from sources:

Install directly to ~/.local/share/gnome-shell/extensions and enable extension

    node_modules/.bin/gulp install

Create ZIP file in dist/ for installation through Gnome Tweak Tool

    node_modules/.bin/gulp dist

# Author

[Edgar Merino](https://github.com/emerinohdz) (emerino at nuevebit dot com)
