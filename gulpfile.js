/**
 * Gnome Shell Extension tasks.
 * 
 * @author emerino
 * 
 */

// sys deps
var fs = require('fs');
var path = require('path');
var zip = require('gulp-zip');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;

// gulp plugins
var gulp = require("gulp");
var clean = require('gulp-clean');

//extension metadata
var metadata = JSON.parse(fs.readFileSync("metadata.json"));

// local config
var config = {
    srcDir: path.join(__dirname, "src"),
    distDir: path.join(__dirname, "dist"),
    installDir: path.join(process.env.HOME, ".local/share/gnome-shell/extensions/" + metadata.uuid)
};

var enableExtension = function(enable, cb) {
    var option = enable ? "-e" : "-d";
    spawn("gnome-shell-extension-tool", [option, metadata.uuid], {stdio: "inherit"})
            .on("exit", function() {
                cb();
            });
};


/**
 * Clean dist dir
 */
gulp.task("clean", function() {
    return gulp.src([config.distDir]).pipe(clean());
});


/**
 * Create ZIP file for distribution to gse
 */
gulp.task("dist", function() {
    return gulp.src([
                "metadata.json",
                config.srcDir + "/**/*"
            ])
            .pipe(zip(metadata.uuid + ".zip"))
            .pipe(gulp.dest(config.distDir));
});

/**
 * Copy the extension to local extensions folder only
 */
gulp.task("copy:extension", function() {
    return gulp.src(["metadata.json", config.srcDir + "/**/*"])
            .pipe(gulp.dest(config.installDir));
});

/**
 * Enable extension.
 */
gulp.task("enable", function(cb) {
    enableExtension(true, cb);
});

/**
 * Disable extension.
 */
gulp.task("disable", function(cb) {
    enableExtension(false, cb);
});

/**
 * Install extension locally.
 */
gulp.task("install", ["copy:extension"], function(cb) {
    return gulp.start("enable");
});

/**
 * Uninstall extension locally. Removes install dir.
 */
gulp.task("uninstall", ["disable"], function(cb) {
    return gulp.src(config.installDir).pipe(clean({force: true}));
});


/**
 * Restart gnome shell task.
 */
gulp.task("restart:gnome-shell", ["copy:extension"], function() {
    var out = fs.openSync('./out.log', 'a');
    var err = fs.openSync('./out.log', 'a');
    var gs = spawn('gnome-shell', ["-r"], { detached: true });
    gs.stdout.on("data", function(chunk) {
        process.stdout.write(chunk.toString());
    });
    gs.stderr.on("data", function(chunk) {
        process.stdout.write(chunk.toString());
    });

    gs.unref();

});

/**
 * Watch files for changes and reinstall then restart gs
 */
gulp.task("default", ["copy:extension"],  function() {
    gulp.watch([config.srcDir + "/**/*"], ["restart:gnome-shell"]);
});
