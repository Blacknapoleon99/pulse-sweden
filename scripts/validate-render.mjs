import {readFile} from 'node:fs/promises';
import YAML from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const schema=await(await fetch('https://render.com/schema/render.yaml.json',{signal:AbortSignal.timeout(20_000)})).json();
const validator=new Ajv({strict:false,allErrors:true});addFormats(validator);
const validate=validator.compile(schema),blueprint=YAML.parse(await readFile(new URL('../render.yaml',import.meta.url),'utf8'));
if(!validate(blueprint)){console.error(validate.errors);process.exitCode=1;}else console.log('Render Blueprint matches the official schema.');
