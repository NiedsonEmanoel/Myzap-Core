const venom = require('venom-bot');
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const JSON_DIALOGFLOW = require(process.env.JSON_LOCATION);
const dialogflow = require('./Classes/dialogflow');
const fallbackresponses = require('./Functions/fallbackresponses');
let serverRest;
const path = require('path');
const restApi = express();

(function () {
    serverRest = require('http').createServer(restApi);
    serverRest.listen(process.env.PORT, process.env.HOST, () => { });
    console.info(`Servidor HTTP rodando em: http://${process.env.HOST}:${process.env.PORT}/`);

    restApi.get('/', (req, res) => {
        res.sendFile(path.resolve('./', 'iframe.html'));
    })

    restApi.get('/qrcode', (req, res) => {
        const tempDir = path.resolve('./', 'Temp')
        const QrCode = path.resolve(tempDir, 'qrcode.png');
        const QrOut = path.resolve(tempDir, 'out.png');

        res.setHeader('Refresh', 5);

        fs.readFile(QrCode, (err, data) => {
            if (err) {
                fs.readFile(QrOut, (err, data) => {
                    if (err) {
                        res.status(500).json("Unavaliable");
                    }
                    else {
                        res.writeHead(200, { 'Content-Type': 'image/png' });
                        res.end(data);
                    }
                });
            } else {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(data);
            }
        });
    });
}());

venom.create('Myzap', (Base64QR => {
    let matches = Base64QR.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer = new Buffer.from(matches[2], 'base64');
    fs.writeFile(path.resolve('./', 'Temp', 'qrcode.png'), buffer, () => { });
}), (status) => {
    if (status == 'qrReadSuccess') {
        fs.unlink(path.resolve('./', 'Temp', 'qrcode.png'), () => { });
    }
}, {
    disableWelcome: true, autoClose: 0, updatesLog: true, disableSpins: true, browserArgs: [
        '--js-flags="--max_old_space_size=80" --disable-web-security',
        '--no-sandbox',
        '--disable-web-security',
        '--aggressive-cache-discard',
        '--disable-cache',
        '--disable-application-cache',
        '--disable-offline-load-stale-cache',
        '--disk-cache-size=0',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list'
    ]
}).then((client) => Start(client)).catch(e => console.log(e));

async function Start(client) {
    client.onMessage(async (message) => {
        async function processPayload(fulfillmentMessages, fullName, message) {
            for (let responses of fulfillmentMessages) {
                try {
                    if (responses.text) {
                        let messageResponse = responses.text.text[0].replace('%USER-NAME%', fullName);
                        await client.reply(message.from, messageResponse, message.id.toString());
                    }

                    if (responses.payload) {
                        if (responses.payload.fields.mediaUrl) {
                            let link = responses.payload.fields.mediaUrl.stringValue;
                            let name = responses.payload.fields.mediaName.stringValue ? responses.payload.fields.mediaName.stringValue : "file";
                            let text = responses.payload.fields.mediaText.stringValue ? responses.payload.fields.mediaText.stringValue : "";
                            try {
                                await client.sendFile(message.from, link, name, text);
                            } catch (e) {
                                try {
                                    await client.sendVoice(message.from, link, name, text);
                                } catch (e) {
                                    console.log(e);
                                }
                            }

                        }
                    }

                } catch (e) {
                    console.log(e);
                }
            }
        }

        if ((message.type === 'chat') && (message.body.length > 256)) {
            client.deleteMessage(message.from, message.id.toString(), false);
            console.info('\nMensagem abortada: TOO_LONG_MESSAGE\n');
            return client.sendText(message.from, 'Desculpe, essa mensagem é muito longa!');
        }

        let bot = new dialogflow(
            JSON_DIALOGFLOW.project_id,
            process.env.JSON_LOCATION,
            'pt-BR',
            message.from
        );

        if (message.type === 'chat') {
            let response = await bot.sendText(message.body);

            if (response.fulfillmentText) {
                processPayload(response.fulfillmentMessages, 'Usuário', message);

                intent = response.intent.displayName;
            } else {
                await client.reply(message.from, fallbackresponses(), message.id.toString());
            }
        } else if (message.hasMedia === true && message.type === 'audio' || message.type === 'ptt') {
            const Buffer = await client.decryptFile(message);
            let nameAudio = auxFunctions.WriteFileMime(message.from, message.mimetype);
            let dir = path.join(__dirname, nameAudio);
            fs.writeFileSync(dir, Buffer, 'base64', () => { });
            let response = await bot.detectAudio(dir, true);

            try {
                if (response.queryResult.fulfillmentText) {
                    processPayload(response.queryResult.fulfillmentMessages, 'Usuário', message);
                    intent = response.queryResult.intent.displayName;
                }

            } catch (e) {
                await client.reply(message.from, fallbackresponses(), message.id.toString());
                console.info('Fallback');
            }
        }
    })
}