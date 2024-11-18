import * as sass from 'sass';
import { readdirSync , writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const compileCss = ({src, dest, ext=[".sass", ".scss"]}) => {

    const srcFiles = readdirSync(src, {withFileTypes: true}).filter(dirent => dirent.isFile() && ext.includes(path.extname(dirent.name)));
    for(const file of srcFiles) {
        const srcFilePath = path.join(src, file.name);
        const baseName = path.basename(file.name, path.extname(file.name));
        const cssName = baseName + '.css';
        const destFilePath = path.join(dest, cssName);
        const result = sass.compile(srcFilePath);
        mkdirSync(dest, { recursive: true });
        writeFileSync(destFilePath, result.css, 'utf-8');
    }

}

export {compileCss}