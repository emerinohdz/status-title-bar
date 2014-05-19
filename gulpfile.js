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

// gulp plugins
var gulp = require("gulp");
var clean = require('gulp-clean');

// local config
var config = {
    srcDir: path.join(__dirname, "src"),
    distDir: path.join(__dirname, "dist")
};

//extension metadata
var metadata = JSON.parse(fs.readFileSync("src/metadata.json"));

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
    return gulp.src(config.srcDir + "/**/*")
            .pipe(zip(metadata.uuid + ".zip"))
            .pipe(gulp.dest(config.distDir));
});

/**
 * Install extension locally.
 */
gulp.task("install", function() {
    var dest = path.join(process.env.HOME, ".local/share/gnome-shell/extensions/" + metadata.uuid);

    return gulp.src(config.srcDir + "/**/*")
            .pipe(gulp.dest(dest));
});

/**
 * Restart gnome shell task.
 */
gulp.task("restart:gnome-shell", ["install"], function() {
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
gulp.task("default", ["install"],  function() {
    gulp.watch([config.srcDir + "/**/*"], ["restart:gnome-shell"]);
});
