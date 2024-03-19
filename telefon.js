import { OpenAI } from 'openai';
import { image as downloadImage } from 'image-downloader';
import filenamify from 'filenamify';
import { readFileSync, writeFileSync } from 'fs';
import dayjs from 'dayjs' 
import fetch from 'node-fetch';
import fs from 'fs';
const today = dayjs().format()

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import "dotenv/config.js";

const openai = new OpenAI({
    apiKey: process.env['OPENAI_API_KEY'], 
});

const DELAY = 1000*15;
const applyStyle = true;
let lineageFile = '';

let readyToDrawNextGen = true;

const convertImageToBase64 = (imgPath) => {
    // read image file
    const img = fs.readFileSync(imgPath);
    
    // get image file extension name
    const extensionName = path.extname(imgPath);
        
    // convert image file to base64-encoded string
    const base64Image = Buffer.from(img, 'binary').toString('base64');
        
    // combine all strings
    const base64ImageStr = `data:image/${extensionName.split('.').pop()};base64,${base64Image}`;
    return base64ImageStr;
}   


if (process.argv.length < 2) {
    console.log('Usage: node telefon.js <lineage file>');
    process.exit(1);
} else {
    lineageFile = process.argv[2];
}


const jsonPath = `${__dirname}/${lineageFile}`;
let relativePath = path.relative(__dirname, jsonPath);
relativePath = relativePath.substring(0, relativePath.lastIndexOf('/')) + "/";
const lineageJSON = readFileSync(jsonPath);
let lineage = JSON.parse(lineageJSON);
const lastGen = lineage.generations.length-1;
const imageToDrawandDescribe = lineage.generations[lastGen];


if (imageToDrawandDescribe.file === '') {
    readyToDrawNextGen = false;
    console.log('No image to describe');
}

if (!imageToDrawandDescribe.description) {
    readyToDrawNextGen = false;
    console.log('No description to draw, so fetching description from OpenAI');
    describeImage(imageToDrawandDescribe);
   // process.exit(0);
} else if (!imageToDrawandDescribe.description.audio) {
    readyToDrawNextGen = false;
    console.log('No audio description, so fetching audio description from OpenAI');
    getSpeechForDescription(imageToDrawandDescribe, 0);
    
}

if (readyToDrawNextGen) {
    let generations = process.argv[3] || 10;
    let nexGen = lineage.generations.length;
    for (let i = 0; i < generations; i++) {
        drawAndDescribe(imageToDrawandDescribe, nexGen, i*3);
        nexGen++;
    }
}

function drawAndDescribe(imageToDrawandDescribe, nextGenNum, delay) {
    const nextGenImageName = `g${nextGenNum}_${imageToDrawandDescribe.file}`;
    let nextGen = { file: nextGenImageName };
    setTimeout(async () => {
        try {
            console.log(`drawing painting ${lineage.title} by ${lineage.artist}`);
            let prompt = `render a ${lineage.style} ${lineage.medium} artwork by ${lineage.artist} that matches the following description: ${imageToDrawandDescribe.description.text}`;
            
            // Acceptable Sizes: ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'
            const SQUARE = '1024x1024';
            const TALL = '1024x1792';
            const WIDE = '1792x1024';
            let size = SQUARE;
            if (lineage.width > lineage.height) {
                size = WIDE;
            } else if (lineage.width < lineage.height) {
                size = TALL;
            }

            let image = await openai.images.generate({ 
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: size
            });
            let revisedPrompt = image.data[0].revised_prompt
            let url = image.data[0].url;
            console.log(`got image ${url}`);
            const filename = path.resolve(`${relativePath}${nextGenImageName}`);
            console.log(filename);
            downloadImage({'url':url, 'dest': filename}).then(({ filename }) => {
                console.log('Saved to', filename);
                lineage.generations.push(nextGen);
                writeFileSync(jsonPath, JSON.stringify(lineage, null, 2), 'utf8');
                describeImage(nextGen, delay+1);
            }).catch((err) => console.error(err));
        } catch (openAIError) { 
            console.log(openAIError);
        }
        
    }, delay*DELAY);
}

function getSpeechForDescription(image, delay) {
    console.log(`getting speech for ${image.file}`);
    setTimeout(async () => {
        const speechFile = `${relativePath}${image.file}.mp3`;
        const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
        //randomly select a voice
        const voice = voices[Math.floor(Math.random() * voices.length)];
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd",
            voice: voice,
            input: image.description.text,
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(speechFile, buffer);
        image.description.audio = { file: speechFile, voice: voice };
        writeFileSync(jsonPath, JSON.stringify(lineage, null, 2), 'utf8');
    }, delay*DELAY);
}

async function describeImage(image, delay) {
    const imagePath = `${relativePath}${image.file}`;
    const base64Image = convertImageToBase64(imagePath);
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What’s in this image?" },
            {
              type: "image_url",
              image_url: {
                "url": base64Image,
              },
            },
          ],
        },
      ],
      "max_tokens": 500
    });
    image.description = { text: response.choices[0].message.content };
    writeFileSync(jsonPath, JSON.stringify(lineage, null, 2), 'utf8');
    getSpeechForDescription(image, delay + 1);
}


