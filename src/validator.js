/////////////////////////////////////////////////
//    TMK MODEL JSON VALIDATOR, CLI VERSION    //
/////////////////////////////////////////////////

// SUGGESTED USAGE
// From the project root:
// npm install # Install dependencies
// node src/validator.js path/to/models/dir --detailed --stats # Show detailed checks and aggregated stats
// EXAMPLE: node src/validator.js Models --detailed --stats # (project_root)/Models/ contains the TMK models to be evaluated

// 'Models dir' is either:
//   a. A folder containing Task.json, Method.json, and Knowledge.json
//   b. A folder containing multiple folders like (a)

// ALL THE SUPPORTED CLI FLAGS
// --detailed : Displays validation results per-field instead of the default per-component
// --raw      : Raw validation results (useful for debugging some errors, when the detailed mode fails)
// --stats    : Displays aggregated schema compliance stats
// --fix      : Fixes trivial errors

// Import the Ajv library, which is a JSON schema validator
import Ajv from 'ajv'
// Import additional format support for Ajv (e.g., email, URI, date-time)
import addFormats from 'ajv-formats'
import fs from 'fs' // For file I/O
import path from 'path' // For file paths

// Quickie to change a string to title case
function toTitleCase(str) {
  // Each Word Starts Uppercase
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Helper to normalise cases
function normaliseCase(data, schema) {
  // Get the schema properties
  const properties = schema.properties || {};
  // Keys to the kingdom (of Ivy)
  const keys = Object.keys(data);
  // We will preserve ordering, but return corrected data
  const corrected = {};

  // For each key pair
  for (const k of keys) {
    // The value of the key
    let value = data[k];
    // Key correction, e.g. 'Model' to 'model'
    // Find a case-insensitive match (the canonical schema key)
    const canonical = Object.keys(properties).find(p => p.toLowerCase() === k.toLowerCase()) || k;

    // Value correction if enum
    const def = properties[canonical];
    
    // If a string and defined in the schema
    if (typeof value === 'string' && def && def.enum && Array.isArray(def.enum)) {
      // Case-insensitive match
      const match = def.enum.find(v => v.toLowerCase() === value.toLowerCase());
      // If found
      if (match) {
        // Overwrite with the data field
        value = match;
      }
    }

    // Recurse into the nested objects/arrays if the schema says so (helps fix non-top-level errors)
    // If an object
    if (def && def.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
      // Normalise the case of the value (recurse)
      value = normaliseCase(value, def);
    } else if (def && def.type === 'array' && Array.isArray(value) && def.items) { // If array
      // Recurse on each object
      value = value.map(item =>
        typeof item === 'object' ? normaliseCase(item, def.items) : item
      );
    }

    // Use the schema's canonical key
    corrected[canonical] = value;
  }
  // Corrected data
  return corrected;
}

// Create a new Ajv instance with options:
// - allErrors: true ensures all validation errors are reported, not just the first
// - strict: false disables strict mode, allowing more leniency in schema definitions
const ajv = new Ajv({ allErrors: true, strict: false });
// Add support for common formats (e.g., regex patterns for emails, dates, etc.)
addFormats(ajv);

// Load the schemata once
// Resolve the absolute path to the 'schemata' directory
const schemaDir = path.resolve('schemata');
// Read and parse JSON schema files into objects for later use
const schemata = {
  // Load Task, Method, Knowledge schemata definitions from file
  Task: JSON.parse(fs.readFileSync(path.join(schemaDir, 'Task.schema.json'), 'utf-8')),
  Method: JSON.parse(fs.readFileSync(path.join(schemaDir, 'Method.schema.json'), 'utf-8')),
  Knowledge: JSON.parse(fs.readFileSync(path.join(schemaDir, 'Knowledge.schema.json'), 'utf-8')),
};

// Compile validators
// Convert the schemata object into an object of compiled validator functions
// Each schema is compiled by Ajv into a function that can validate data against it
const validators = Object.fromEntries(
  Object.entries(schemata).map(([name, schema]) => [name, ajv.compile(schema)])
);

/**
 * Validate JSON against a chosen schema
 * @param {Object} data - The JSON object to validate
 * @param {'Task'|'Method'|'Knowledge'} schemaName - Which schema to use
 * @returns {{ valid: boolean, errors?: any }}
 */
// Exported function to validate a given JSON object against a specified schema
export function validateJSON(data, schemaName) {
  // Retrieve the validator function for the requested schema
  const validate = validators[schemaName];
  // If the schema name is not recognised, throw an error
  if (!validate) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }

  // Run the validator against the provided data
  const valid = validate(data);
  // Return an object indicating whether validation passed
  // If invalid, include the list of errors
  return valid ? { valid } : { valid, errors: validate.errors };
}

// Example CLI usage to validate against T, M, K respectively
// `node src/validator.js Task test.json`
// `node src/validator.js Method test.json`
// `node src/validator.js Knowledge test.json`

/*
// If the script is run directly from the command line with arguments
if (require.main === module) {

  if (process.argv.length > 2) {
    // Extract the JSON file path from command line arguments
    const [,, jsonFile] = process.argv;
    // Match the schema to the filename
    const schemaName = path.basename(jsonFile, '.json');

    // Read and parse the JSON file provided by the user
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    // Validate the parsed data against the chosen schema
    const result = validateJSON(data, schemaName);
    // Print the validation result to the console in a nicely formatted JSON string
    console.log(JSON.stringify(result, null, 2));
  } else if (process.argv.length > 3) {
    // Extract schema name and JSON file path from command line arguments
    const [,, schemaName, jsonFile] = process.argv;
    // Read and parse the JSON file provided by the user
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    // Validate the parsed data against the chosen schema
    const result = validateJSON(data, schemaName);
    // Print the validation result to the console in a nicely formatted JSON string
    console.log(JSON.stringify(result, null, 2));
  }
}
*/

/**
 * 'Bond, James Bond'-level refined scoring using Ajv per-field validation
 * Calculates a numerical score for a JSON object based on its adherence to a schema.
 * @param {Object} data - The actual JSON data to be evaluated.
 * @param {Object} schema - The JSON schema used as the benchmark for validation.
 * @param {boolean} [detailed=false] - If true, returns a field-by-field breakdown.
 * @returns {Object} An object containing the total score, maximum potential score, and optional field details.
 */
function scoreJSON(data, schema, detailed = false) {
  // Initialise the running tally and total possible points
  let score = 0;
  let max = 0;
  // Convert required fields into a Set for efficient, O(1) lookups
  const required = new Set(schema.required || []);
  // Access the properties defined in the schema, defaulting to an empty object if none exist
  const properties = schema.properties || {};
  // Initialise an object to store individual field results for detailed reporting
  const fields = {};

  // Iterate through each field definition within the schema's properties
  for (const [field, def] of Object.entries(properties)) {
    // Increment the maximum possible score by 2 for every property checked
    max += 2;
    // Check if the data object is missing the current field
    if (data[field] === undefined) {
      if (required.has(field)) {
        // Required but missing: 0
        if (detailed) fields[field] = { score: 0, max: 2, reason: '\x1b[31mMissing required field\x1b[0m' };
      } else {
        // Not required and missing: full points
        score += 2;
        if (detailed) fields[field] = { score: 2, max: 2, reason: '\x1b[32m\'Vacuously\' correct\x1b[0m' };
      }
      // Skip further validation logic for this field as it does not exist
      continue;
    }

    // Construct a temporary schema to validate this specific field in isolation
    const fieldSchema = { type: 'object', properties: { [field]: def }, required: required.has(field) ? [field] : [] };
    // Compile the schema using the AJV library
    const validateField = ajv.compile(fieldSchema);
    // Execute the validation against the specific data value
    const valid = validateField({ [field]: data[field] });

    // Award 2 points for valid data; 1 point for presence but failed validation (malformed)
    const fieldScore = valid ? 2 : 1;
    score += fieldScore;
    // Map the results to the fields object if a detailed breakdown is requested
    if (detailed) {
      let reason;
      if (data[field] === undefined) {
        reason = required.has(field) ? '\x1b[31mMissing required field\x1b[0m' : '\x1b[32m\'Vacuously\' correct\x1b[0m';
      } else if (valid) {
        reason = '\x1b[32mCorrect type\x1b[0m';
      } else {
        // Use Ajv's first error message for this field if available
        const err = validateField.errors?.find(e => e.instancePath.startsWith(`/${field}`) || e.instancePath === '');
        reason = err ? `\x1b[31m\`${err.keyword}\` - ${err.message}\x1b[0m` : '\x1b[31mValidation failed\x1b[0m';
      }
      fields[field] = { score: fieldScore, max: 2, reason };
    }
  }

  // Return the final result set, conditionally including the detailed field breakdown
  return detailed ? { score, max, fields } : { score, max };
}

// ------------------------------------------------------------
// Cartesian-product validator runner
// Run as `node src/validator.js`
// ------------------------------------------------------------

// Array of directories you want to test (each should contain Task.json Method.json, Knowledge.json)
let dirs = [];

if (process.argv.length > 2) {
  const targetPath = process.argv[2];
  const stat = fs.statSync(targetPath);

  if (stat.isDirectory()) {
    // Check if it directly contains Task.json etc.
    const hasSchemaFiles = ['Task.json', 'Method.json', 'Knowledge.json']
      .every(f => fs.existsSync(path.join(targetPath, f)));

    if (hasSchemaFiles) {
      // Treat as a single model folder
      dirs = [targetPath];
    } else {
      // Treat as a models directory containing multiple model folders
      dirs = fs.readdirSync(targetPath)
        .map(name => path.join(targetPath, name))
        .filter(subdir => {
          try {
            return fs.statSync(subdir).isDirectory() &&
              ['Task.json', 'Method.json', 'Knowledge.json']
                .every(f => fs.existsSync(path.join(subdir, f)));
          } catch {
            return false;
          }
        });
    }
  } else {
    throw new Error(`Provided path is not a directory: ${targetPath}`);
  }
} else {
  throw new Error('Usage: node validator.js <path/to/model/folder|path/to/models/dir>');
}

/**
 * Compute the Cartesian product of an array of arrays
 * @param {Array[]} arr - An array of arrays to combine
 * @returns {Array[]} - All possible combinations of elements
 */
function cartesianProduct(arr) {
  return arr.reduce(
    (a, b) => a.flatMap(x => b.map(y => [...x, y])),
    [[]]
  );
}

// Each directory contributes a triple: Task.json, Method.json, Knowledge.json
// Here, we construct triples of file paths for each of T, M, K in a directory
const directoryTriples = dirs.map(dir => ({
  Task: path.join(dir, 'Task.json'),
  Method: path.join(dir, 'Method.json'),
  Knowledge: path.join(dir, 'Knowledge.json'),
}));

// Build the Cartesian product (all combinations) of these triples
const products = cartesianProduct(directoryTriples.map(d => [d]));

// For the love of lies, damned lies, and statistics
const collectStats = process.argv.includes('--stats');

// Function to calculate mean, SD
function getStats(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / n);
  return { mean, sd };
}

// Stats tracker
const stats = {
  Task: [],
  Method: [],
  Knowledge: [],
  Global: [] // Combined scores
};

// Run validation for each combination
for (const combo of products) {
  // For each combination (a triple)
  for (const { Task, Method, Knowledge } of combo) {
    // Collect file paths
    const files = { Task, Method, Knowledge };

    // Validate each file against its schema (this is why the filenames must be exactly `Task.json`, `Method.json`, `Knowledge.json`)
    for (const [schemaName, filePath] of Object.entries(files)) {
      // Read and parse the JSON
      let json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Detect CLI flag to fix the file inplace
      const fix = process.argv.includes('--fix');

      // Conditionally fix the input
      if (fix) {
        // Normalise cases before validation
        json = normaliseCase(json, schemata[schemaName]);
        // Write back the case-normalised JSON to the same file
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
      }

      // Validate the parsed data against its schema
      const result = validateJSON(json, schemaName);

      // Detect CLI flags
      const detailed = process.argv.includes('--detailed');
      // Raw = Unfiltered Ajv output
      const raw = process.argv.includes('--raw');

      // Compute score
      const { score, max, fields } = scoreJSON(json, schemata[schemaName], detailed);

      // Report status
      console.log(`\nValidating ${filePath} against ${schemaName} schema:`);

      // If collecting stats
      if (collectStats) {
        // Push the percentage score for stats
        const percent = (score / max) * 100;
        stats[schemaName].push(percent); // Per-schema scores
        stats.Global.push(percent); // Push every score here too
      }

      // Outcome
      if (result.valid) {
        console.log('\x1b[32m✅ VALID\x1b[0m'); // green
      } else {
        console.log('\x1b[31m❌ INVALID\x1b[0m'); // red
        // Unfiltered Ajv output
        if (raw) {
          console.log(result.errors); // Show validation errors
        }
      }

      // Scoring: Overall
      console.log(`Score: ${score}/${max}`);

      // Check for the detailed flag (to give per-field scores)
      if (detailed && fields) {
        // Detailed scores
        console.log('Per-field scores:');
        // Per-field score for each field
        for (const [f, { score, max, reason }] of Object.entries(fields)) {
          console.log(`  ${f}: ${score}/${max} (${reason})`);
        }
      }
    }
  }
}

if (collectStats) {
  // Final Reporting Block
  console.log('\n' + '='.repeat(50));
  console.log('        FINAL AGGREGATE STATS (Percentage)        ');
  console.log('='.repeat(50));

  for (const [key, scores] of Object.entries(stats)) {
    const { mean, sd } = getStats(scores);
    const label = key === 'Global' ? 'TOTAL AGGREGATE' : key;
    
    console.log(`${label.padEnd(20)} | Mean: ${mean.toFixed(2)}% | SD: ${sd.toFixed(2)}%`);
  }

  // Newline for clarity
  console.log();
}
