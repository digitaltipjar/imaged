const gulp = require('gulp');
const mocha = require('gulp-mocha');
const babel = require('gulp-babel');
const eslint = require('gulp-eslint');
const gls = require('gulp-live-server');

const testPath = './test/**/*.spec.js';
const srcPath = './src/**/*.js';
const libPath = './lib';

gulp.task('lint', function () {
  return gulp.src([srcPath])
      .pipe(eslint())
      .pipe(eslint.format())
});

gulp.task('build', ['lint'], function() {
  return gulp.src([srcPath])
      .pipe(babel())
      .pipe(gulp.dest(libPath));
});

gulp.task('server', ['build'], function () {
  const server = gls.new(libPath + "/index.js");
  server.start();
});
