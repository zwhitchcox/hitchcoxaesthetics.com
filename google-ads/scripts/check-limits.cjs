const fs = require('fs')
const yaml = require('js-yaml')
const path = require('path')

const adGroupsDir = path.join(__dirname, '../adgroups')
const files = fs.readdirSync(adGroupsDir).filter(f => f.endsWith('.yaml'))

let hasErrors = false

for (const file of files) {
	const filePath = path.join(adGroupsDir, file)
	const data = yaml.load(fs.readFileSync(filePath, 'utf8'))

	console.log(`Checking ${file}...`)

	if (data.headlines) {
		if (data.headlines.length > 15) {
			console.error(`  ERROR: Too many headlines (${data.headlines.length}/15)`)
			hasErrors = true
		}
		data.headlines.forEach(h => {
			if (h.length > 30) {
				console.error(`  ERROR: Headline too long (${h.length}/30): "${h}"`)
				hasErrors = true
			}
		})
	}

	if (data.descriptions) {
		if (data.descriptions.length > 4) {
			console.error(
				`  ERROR: Too many descriptions (${data.descriptions.length}/4)`,
			)
			hasErrors = true
		}
		data.descriptions.forEach(d => {
			if (d.length > 90) {
				console.error(`  ERROR: Description too long (${d.length}/90): "${d}"`)
				hasErrors = true
			}
		})
	}
}

if (!hasErrors) {
	console.log('All files passed character limits check!')
} else {
	process.exit(1)
}
