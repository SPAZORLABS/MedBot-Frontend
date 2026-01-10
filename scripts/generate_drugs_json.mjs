import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '..', 'faers_drug_summary.csv');
const jsonPath = path.join(__dirname, '..', 'public', 'drugs.json');

async function generateDrugsJson() {
  try {
    console.log(`Reading CSV from ${csvPath}...`);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    const lines = csvContent.split('\n');
    const drugs = new Set();
    
    // Skip header and process lines
    // Assuming first column is drug name based on file view: "drugname,ADR_Count,..."
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Simple CSV splitting by comma, handling potential quotes if needed
        // For this verified file, simple split or regex is usually enough if names don't have commas
        // Looking at the file view, some fields have quotes "OSTEOPOROSIS, ARTHRITIS...", but drug names seem simple.
        // Let's use a regex to be safer about the first column.
        
        // Match everything up to the first comma
        const match = line.match(/^([^,]+),/);
        if (match && match[1]) {
            let drugName = match[1].trim();
            // Remove quotes if present
            if (drugName.startsWith('"') && drugName.endsWith('"')) {
                drugName = drugName.slice(1, -1);
            }
            if (drugName) {
                drugs.add(drugName);
            }
        }
    }
    
    const sortedDrugs = Array.from(drugs).sort();
    
    console.log(`Found ${sortedDrugs.length} unique drugs.`);
    
    const output = {
        drugs: sortedDrugs,
        total: sortedDrugs.length,
        generated_at: new Date().toISOString()
    };
    
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    console.log(`Successfully wrote to ${jsonPath}`);
    
  } catch (error) {
    console.error('Error generating drugs JSON:', error);
    process.exit(1);
  }
}

generateDrugsJson();
