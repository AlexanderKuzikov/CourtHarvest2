const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data_20260712/courts.json', 'utf8'));
const courts = data.courts;
const keys = Object.keys(courts);
console.log('Total courts:', keys.length);

// Perm district courts
const permRS = keys.filter(k => courts[k].code.startsWith('59RS'));
const permMS = keys.filter(k => courts[k].code.startsWith('59MS'));
console.log('\n59RS district courts:');
permRS.forEach(k => console.log('  ' + courts[k].code + ' | ' + courts[k].name + ' | ' + (courts[k].website || '-')));
console.log('\n59MS magistrate courts:');
permMS.forEach(k => console.log('  ' + courts[k].code + ' | ' + courts[k].name + ' | ' + (courts[k].website || '-')));

// Sample appeal & cassation
const permAS = keys.filter(k => courts[k].code.startsWith('59AS'));
console.log('\n59AS (appeal):');
permAS.forEach(k => console.log('  ' + courts[k].code + ' | ' + courts[k].name + ' | ' + (courts[k].website || '-')));

const kas = keys.filter(k => courts[k].code.includes('KAS') || courts[k].code.includes('7KAS'));
console.log('\nKAS:');
kas.forEach(k => console.log('  ' + courts[k].code + ' | ' + courts[k].name + ' | ' + (courts[k].website || '-')));

// Check the structure of a full entry with website
const withSite = keys.filter(k => courts[k].website);
console.log('\nSample with website:');
console.log(JSON.stringify(courts[withSite[0]], null, 2));

// Check for court_id or other linking fields
console.log('\nAll fields present in entries:');
const fieldSet = new Set();
keys.forEach(k => Object.keys(courts[k]).forEach(f => fieldSet.add(f)));
console.log([...fieldSet].join(', '));
