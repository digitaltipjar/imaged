'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _gm = require('gm');

var _gm2 = _interopRequireDefault(_gm);

var _nodeUuid = require('node-uuid');

var _nodeUuid2 = _interopRequireDefault(_nodeUuid);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _multer = require('multer');

var _multer2 = _interopRequireDefault(_multer);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var upload = (0, _multer2.default)({ dest: 'uploads/' });

var s3 = new _awsSdk2.default.S3({ region: 'us-east-1' });

var gmObj = _gm2.default.subClass({ imageMagick: true });
var app = (0, _express2.default)();
var port = process.env.PORT || 3000;

function getExtension(fileName) {
  return '.' + fileName.split('.').pop();
};

function getMimeType(extension) {
  if (extension == '.png') return 'image/png';

  if (extension == '.jpg' || extension == '.jpeg' || extension == '.jpe') return 'image/jpeg';

  if (extension == '.gif') return 'image/gif';

  if (extension == '.tif' || extension == '.tiff') return 'image/tif';

  if (extension == '.bmp') return 'image/bmp';

  return 'application/octet-stream';
};

function getFolderName(width, height, ignore_aspect) {
  if (!width && !height) {
    return "original";
  }

  if (width & !height) {
    return "w" + width;
  }

  if (!width & height) {
    return "h" + height;
  }

  return "w" + width + "h" + height;
}

app.post('/', upload.single('image'), function (req, res) {

  var image = req.file;

  if (!image) {
    return res.status(412).send({ error: 'No File Attached.' });
  }

  console.log(image);

  if (image.mimetype.indexOf('image/') > -1) {
    _fs2.default.readFile(image.path, function (err, data) {
      var hash = _nodeUuid2.default.v4();
      var extension = getExtension(image.originalname);

      var uploadParams = {
        Bucket: process.env.S3_BUCKET,
        Key: "original" + '/' + hash + extension,
        Body: data,
        ContentLength: image.size,
        ContentType: getMimeType(extension),
        ACL: 'public-read'
      };

      s3.putObject(uploadParams, function (error, data) {
        if (error) {
          console.log(error);
          console.error("error uploading image");
          res.status(500).send({ error: 'Upload error' });
        } else {
          res.status(200);
          res.end();
        }
      });
    });
  } else {
    return res.send(412, { error: 'Not an image' });
  }
});

app.get('/images/:hash', function (req, res) {

  var hash = req.params.hash;
  var width = req.query.w || null;
  var height = req.query.h || null;
  var ignore_aspect = req.query.ignore_aspect != null ? "!" : null;

  var folderName = getFolderName(width, height, ignore_aspect);

  var reqParams = { Bucket: process.env.S3_BUCKET, Key: folderName + '/' + hash };
  console.log(reqParams);

  s3.headObject(Object.assign({}, reqParams, { Key: "original" + '/' + hash }), function (error, originalData) {
    if (error) {
      console.log(error);
      console.error("image not found");
      res.status(404).send({ error: 'Not found' });
    } else {
      console.info("original image found");
      console.info("check for image with " + folderName);
      s3.headObject(reqParams, function (error, data) {
        if (error) {

          console.info("image with " + folderName + "not found, creating now");

          var s3Stream = s3.getObject(Object.assign({}, reqParams, { Key: "original" + '/' + hash })).createReadStream();

          console.info("shrinking");
          gmObj(s3Stream).resize(width, height, ignore_aspect).toBuffer(function (error, buffer) {
            if (error) {
              console.log(error);
              console.error("error uploading image");
              res.status(500).send({ error: 'Upload error' });
            } else {
              console.info("uploading shrunken image");
              s3.putObject(Object.assign({}, reqParams, { Body: buffer, ContentLength: buffer.length, ContentType: originalData.ContentType, ACL: 'public-read' }), function (error, data) {
                if (error) {
                  console.log(error);
                  console.error("error uploading image");
                  res.status(500).send({ error: 'Upload error' });
                } else {
                  console.info("sending image response");
                  res.status(200);
                  res.end(buffer);
                }
              });
            }
          });
        } else {
          console.log(reqParams);
          console.log(data);
          console.info("shrunken image found: sending image response");
          s3.getObject(reqParams).createReadStream().pipe(res);
        }
      });
    }
  });
});

var server = app.listen(port, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});