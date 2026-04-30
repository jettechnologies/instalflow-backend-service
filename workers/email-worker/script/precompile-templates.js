import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';

const templatesDir = path.resolve('../../mail-templates'); // your templates folder
const outputFile = path.resolve('./src/templates.js');

const templateFiles = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.html'));

let content = `import Handlebars from "handlebars/runtime";\n\nconst templates = {};\n\n`;

for (const file of templateFiles) {
	const templateName = path.basename(file, '.html');
	const filePath = path.join(templatesDir, file);
	const source = fs.readFileSync(filePath, 'utf-8');

	// Precompile template
	const precompiled = Handlebars.precompile(source);

	content += `templates["${templateName}"] = Handlebars.template(${precompiled});\n\n`;
}

content += `export default templates;\n`;

fs.writeFileSync(outputFile, content);

console.log('Templates precompiled successfully!');
