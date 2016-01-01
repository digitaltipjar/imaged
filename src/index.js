import express from 'express';
import AWS from 'aws-sdk';
import gm from 'gm';
import uuid from 'node-uuid';
import fs from 'fs';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' })

const s3 = new AWS.S3({region: 'us-east-1'});

const gmObj = gm.subClass({ imageMagick: true });
const app = express();
const port = process.env.PORT || 3000;

function getExtension(fileName){
    return '.' + fileName.split('.').pop();
};

function getMimeType(extension) {
  if(extension == '.png')
      return 'image/png';

  if(extension == '.jpg' || extension == '.jpeg' || extension == '.jpe')
      return 'image/jpeg';

  if(extension == '.gif')
      return 'image/gif';

  if(extension == '.tif' || extension == '.tiff')
      return 'image/tif';

  if(extension == '.bmp')
      return 'image/bmp';

  return 'application/octet-stream';

};

function getFolderName(width, height, ignore_aspect ){
  if(!width && !height){
    return "original";
  }

  if(width & !height){
    return "w" + width;
  }

  if(!width & height){
    return "h" + height;
  }

  return "w" + width + "h" + height;
}

app.post('/', upload.single('image'), function (req, res) {

    let image = req.file;

    if(!image){
      return res.status(412).send({ error: 'No File Attached.' });
    }

    if(image.mimetype.indexOf('image/') > -1){
        fs.readFile(image.path, function (err, data) {
            let hash = uuid.v4();
            let extension = getExtension(image.originalname);

            const uploadParams = {
              Bucket: process.env.S3_BUCKET,
              Key: "original" + '/' + hash + extension,
              Body: data,
              ContentLength: image.size,
              ContentType: getMimeType(extension),
              ACL: 'public-read'
            }

            s3.putObject(uploadParams, function(error, data){
              if(error){
                console.log(error);
                console.error("error uploading image");
                res.status(500).send({ error: 'Upload error' });
              }else{
                const fullURL = req.protocol + "://" + req.get('host') + '/images/' + hash + extension;
                res.status(200);
                res.send(fullURL);
              }
            });
        });
    }else{
        return res.send(412, { error: 'Not an image' });
    }


});

app.get('/images/:hash', (req, res) => {

  const hash = req.params.hash;
  const width = req.query.w || null;
  const height = req.query.h || null;
  const ignore_aspect = req.query.ignore_aspect != null ? "!" : null;

  const folderName = getFolderName(width, height, ignore_aspect);

  const reqParams = { Bucket: process.env.S3_BUCKET, Key: folderName + '/' + hash };

  s3.headObject(Object.assign({}, reqParams, {Key: "original" + '/' + hash}) , function(error, originalData){
    if(error){
      console.error("image not found");
      res.status(404).send({ error: 'Not found' });
    }else{
      console.info("original image found");
      console.info("check for image with " + folderName);
      s3.headObject(reqParams, function(error, data){
        if(error){

          console.info("image with " + folderName + "not found, creating now");

          const s3Stream = s3.getObject(Object.assign({}, reqParams, {Key: "original" + '/' + hash})).createReadStream();

          console.info("shrinking");
          gmObj(s3Stream)
          .resize(width, height, ignore_aspect)
          .toBuffer(function (error, buffer) {
            if (error){
              console.error("error uploading image");
              res.status(500).send({ error: 'Upload error' });
            }else{
              console.info("uploading shrunken image");
              s3.putObject(Object.assign({}, reqParams, { Body: buffer, ContentLength: buffer.length, ContentType: originalData.ContentType, ACL: 'public-read' }), function(error, data){
                if(error){
                  console.error("error uploading image");
                  res.status(500).send({ error: 'Upload error' });
                }else{
                  console.info("sending image response");
                  res.status(200)
                  res.end(buffer);
                }
              });
            }
          })

        }else{
          console.info("shrunken image found: sending image response");
          s3.getObject(reqParams).createReadStream().pipe(res);
        }
      })
  }});
});


let server = app.listen(port, function () {
  let host = server.address().address;
  let port = server.address().port;

  console.log('Example app listening at http://%s:%s', host, port);
});
