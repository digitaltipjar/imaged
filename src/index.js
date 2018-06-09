const express = require('express');
const AWS = require('aws-sdk');
const gm = require('gm');
const fs = require('fs');
const multer = require('multer');
const util = require('util');

const upload = multer({ dest: 'uploads/' });

const s3 = new AWS.S3({ region: 'us-east-1' });

const gmObj = gm.subClass({ imageMagick: true });
const app = express();
const port = process.env.PORT || 3000;

//http://blog.grossman.io/how-to-write-async-await-without-try-catch-blocks-in-javascript/
function to(promise) {
    return promise.then(data => [null, data]).catch(err => [err, null]);
}

function getFolderName(width, height, ignore_aspect) {
    if (!width && !height) {
        return 'original';
    }

    if (width & !height) {
        return 'w' + width;
    }

    if (!width & height) {
        return 'h' + height;
    }

    return 'w' + width + 'h' + height;
}

app.get('/images/:hash', async (req, res) => {
    const hash = req.params.hash;
    const width = req.query.w || null;
    const height = req.query.h || null;
    const ignore_aspect = req.query.ignore_aspect != null ? '!' : null;

    const folderName = getFolderName(width, height, ignore_aspect);

    const reqParams = {
        Bucket: process.env.S3_BUCKET,
        Key: folderName + '/' + hash,
    };

    let error, originalData, resizedData, buffer, data;

    const resizedImageExistPromise = s3.headObject(reqParams).promise();

    //Check to see if resized file exists
    [error, resizedData] = await to(resizedImageExistPromise);

    if (resizedData) {
        //It does so we can stop here
        s3
            .getObject(reqParams)
            .createReadStream()
            .pipe(res);
        return;
    }

    const originalImageParams = Object.assign({}, reqParams, {
        Key: 'original' + '/' + hash,
    });

    const originalImageExistPromise = s3
        .headObject(originalImageParams)
        .promise();

    //Check to see if original file exists
    [error, originalData] = await to(originalImageExistPromise);

    if (error) {
        console.error('image not found');
        res.status(404).send({ error: 'Not found' });
        return;
    }

    console.info(`image with ${folderName} not found, creating now`);
    const getObjectConfig = Object.assign({}, reqParams, {
        Key: 'original' + '/' + hash,
    });

    //Let's generate a new resized image now
    //We get the original image and resize it
    const s3Stream = s3.getObject(getObjectConfig).createReadStream();
    gmObj(s3Stream)
        .resize(width, height, ignore_aspect)
        .toBuffer(async function(error, buffer) {
            if (error) {
                console.error('error generating image');
                res.status(500).send({ error: 'Image generation error' });
                return;
            }

            console.info('uploading shrunken image');
            const putParams = Object.assign({}, reqParams, {
                Body: buffer,
                ContentLength: buffer.length,
                ContentType: originalData.ContentType,
                ACL: 'public-read',
            });

            const putResizedImagePromise = s3.putObject(putParams).promise();

            [error, data] = await to(putResizedImagePromise);

            if (error) {
                console.error('error uploading image');
                res.status(500).send({ error: 'Upload error' });
            } else {
                console.info('sending image response');
                res.status(200);
                res.end(buffer);
            }
        });
});

let server = app.listen(port, () => {
    let host = server.address().address;
    let port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});
