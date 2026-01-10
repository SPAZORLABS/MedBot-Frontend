import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CSV_PATH = path.join(__dirname, '../reports/evaluation_metrics.csv');
const OUTPUT_PATH = path.join(__dirname, '../public/metrics.json');

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i].split(',');
        const entry = {};
        for (let j = 0; j < headers.length; j++) {
            let value = currentLine[j] ? currentLine[j].trim() : '';
            // Try to convert to number if possible, except for Group
            if (headers[j] !== 'Group' && !isNaN(parseFloat(value))) {
                value = parseFloat(value);
            }
            entry[headers[j]] = value;
        }
        data.push(entry);
    }
    return data;
}

function processGroupNames(data) {
    return data.map(item => {
        let group = item.Group;
        if (group === 'Sex: 1') group = 'Male';
        if (group === 'Sex: 2') group = 'Female';
        // Keep other group names as is (Age: <40, etc.)
        return { ...item, Group: group };
    });
}

try {
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const rawData = parseCSV(csvContent);
    const processedData = processGroupNames(rawData);

    // Find Overall stats for the top cards
    const overall = processedData.find(d => d.Group === 'Overall') || {};

    const output = {
        overall: overall,
        groups: processedData
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`Successfully generated ${OUTPUT_PATH}`);
    console.log(`Total groups processed: ${processedData.length}`);
} catch (error) {
    console.error('Error generating metrics JSON:', error);
    process.exit(1);
}
