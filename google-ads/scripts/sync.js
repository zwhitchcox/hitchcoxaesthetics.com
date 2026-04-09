require('dotenv').config()
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { GoogleAdsApi, enums, ResourceNames } = require('google-ads-api')
const yaml = require('js-yaml')
const sharp = require('sharp')

const client = new GoogleAdsApi({
	client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
	client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
	developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
})

const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '')
const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN || ''
const isDryRun = !process.env.GOOGLE_ADS_DEVELOPER_TOKEN

const customer = client.Customer({
	customer_id: customerId,
	refresh_token: refreshToken,
})

const cacheFile = path.join(__dirname, 'asset-cache.json')
let assetCache = {}
if (fs.existsSync(cacheFile)) {
	assetCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
}

function saveCache() {
	fs.writeFileSync(cacheFile, JSON.stringify(assetCache, null, 2))
}

function loadYaml(filePath) {
	try {
		return yaml.load(fs.readFileSync(filePath, 'utf8'))
	} catch (e) {
		console.error(`Error loading ${filePath}:`, e.message)
		return null
	}
}

function loadCampaignData() {
	const baseDir = path.join(__dirname, '..')
	return {
		assets: loadYaml(path.join(baseDir, '00-Account-Level', 'assets.yaml')),
		brandSearch: loadYaml(
			path.join(baseDir, '01-Search-Brand', 'brand-protect.yaml'),
		),
		nonBrandSearchGroups: [
			loadYaml(
				path.join(baseDir, '02-Search-NonBrand', 'wrinkle-relaxers.yaml'),
			),
			loadYaml(path.join(baseDir, '02-Search-NonBrand', 'dermal-fillers.yaml')),
			loadYaml(path.join(baseDir, '02-Search-NonBrand', 'laser-services.yaml')),
			loadYaml(path.join(baseDir, '02-Search-NonBrand', 'microneedling.yaml')),
			loadYaml(path.join(baseDir, '02-Search-NonBrand', 'weight-loss.yaml')),
		].filter(Boolean),
		pmax: loadYaml(
			path.join(baseDir, '03-Performance-Max', 'pmax-medspa.yaml'),
		),
		demandGen: loadYaml(
			path.join(baseDir, '04-Demand-Gen-Retargeting', 'demand-gen.yaml'),
		),
	}
}

// ------------------------------------------------------------------
// ASSET MANAGEMENT (IMAGES & TEXT)
// ------------------------------------------------------------------

async function getOrCreateImageAsset(localPath) {
	if (assetCache[localPath]) return assetCache[localPath]
	if (isDryRun) return `dry-run-asset-id-${path.basename(localPath)}`

	const fullPath = path.join(__dirname, '../../', localPath)
	if (!fs.existsSync(fullPath)) {
		console.warn(`  ⚠️ Image not found locally: ${fullPath}`)
		return null
	}

	console.log(`  Uploading image: ${localPath}...`)
	const tempDir = path.join(__dirname, 'tmp_images')
	if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)
	const hash = crypto.createHash('md5').update(localPath).digest('hex')
	const destPath = path.join(tempDir, `${hash}.jpg`)

	await sharp(fullPath).jpeg({ quality: 90 }).toFile(destPath)
	const data = fs.readFileSync(destPath)

	const request = {
		entity: 'asset',
		operation: 'create',
		resource: {
			type: enums.AssetType.IMAGE,
			name: path.basename(localPath),
			image_asset: { data: data.toString('base64') },
		},
	}

	try {
		const res = await customer.mutateResources([request])
		const rName = res.results[0].resource_name
		assetCache[localPath] = rName
		saveCache()
		console.log(`  ✅ Uploaded: ${rName}`)
		return rName
	} catch (err) {
		console.error(`  ❌ Image upload failed:`, err.message)
		return null
	}
}

async function getOrCreateTextAsset(text) {
	const cacheKey = `text:${text}`
	if (assetCache[cacheKey]) return assetCache[cacheKey]
	if (isDryRun)
		return `dry-run-text-asset-${crypto.createHash('md5').update(text).digest('hex').substring(0, 6)}`

	const request = {
		entity: 'asset',
		operation: 'create',
		resource: {
			type: enums.AssetType.TEXT,
			text_asset: { text: text },
		},
	}

	try {
		const res = await customer.mutateResources([request])
		const rName = res.results[0].resource_name
		assetCache[cacheKey] = rName
		saveCache()
		return rName
	} catch (err) {
		console.error(`  ❌ Text asset creation failed ("${text}"):`, err.message)
		return null
	}
}

// ------------------------------------------------------------------
// CAMPAIGNS & BUDGETS
// ------------------------------------------------------------------

async function getExistingCampaigns() {
	if (isDryRun) return {}
	try {
		const campaigns = await customer.query(`
      SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status != "REMOVED"
    `)
		return campaigns.reduce((acc, row) => {
			acc[row.campaign.name] = row.campaign.id
			return acc
		}, {})
	} catch (e) {
		console.error('Failed to fetch existing campaigns.', e.message)
		return {}
	}
}

async function createCampaignWithBudget(
	campaignName,
	budgetAmount,
	channelType,
) {
	if (isDryRun) {
		console.log(
			`[DRY RUN] Would create ${channelType} campaign: ${campaignName} ($${budgetAmount}/day)`,
		)
		return 'dry-run-campaign-id'
	}

	console.log(`Creating campaign: ${campaignName} ($${budgetAmount}/day)...`)
	const budgetResourceName = ResourceNames.campaignBudget(customerId, '-1')
	const operations = [
		{
			entity: 'campaign_budget',
			operation: 'create',
			resource: {
				resource_name: budgetResourceName,
				name: `${campaignName} - Budget`,
				delivery_method: enums.BudgetDeliveryMethod.STANDARD,
				amount_micros: budgetAmount * 1000000,
			},
		},
		{
			entity: 'campaign',
			operation: 'create',
			resource: {
				name: campaignName,
				advertising_channel_type: channelType,
				status: enums.CampaignStatus.PAUSED,
				campaign_budget: budgetResourceName,
				target_spend: {},
			},
		},
	]

	if (channelType === enums.AdvertisingChannelType.SEARCH) {
		operations[1].resource.network_settings = {
			target_google_search: true,
			target_search_network: false,
			target_content_network: false,
			target_partner_search_network: false,
		}
	}

	try {
		const result = await customer.mutateResources(operations)
		const newCamp = result.results.find(r =>
			r.resource_name.includes('campaigns/'),
		)
		console.log(`✅ Successfully created campaign: ${campaignName}`)
		return newCamp.resource_name.split('/')[3]
	} catch (err) {
		console.error(`❌ Failed to create campaign ${campaignName}:`, err.message)
		return null
	}
}

// ------------------------------------------------------------------
// SEARCH CAMPAIGNS (AdGroups, Keywords, RSAs)
// ------------------------------------------------------------------

async function syncSearchAdGroup(campaignId, adGroupData) {
	if (isDryRun) {
		console.log(`[DRY RUN] Would sync Ad Group: ${adGroupData.name}`)
		return
	}

	console.log(`  Syncing Ad Group: ${adGroupData.name}...`)
	try {
		const agRes = await customer.mutateResources([
			{
				entity: 'ad_group',
				operation: 'create',
				resource: {
					name: adGroupData.name,
					campaign: ResourceNames.campaign(customerId, campaignId),
					type: enums.AdGroupType.SEARCH_STANDARD,
					status: enums.AdGroupStatus.ENABLED,
				},
			},
		])
		const adGroupId = agRes.results[0].resource_name.split('/')[3]
		console.log(`  ✅ Ad Group created: ${adGroupId}`)

		// Keywords
		if (adGroupData.keywords?.length) {
			const kwOps = adGroupData.keywords.map(kw => {
				let matchType = enums.KeywordMatchType.BROAD
				let text = kw
				if (kw.startsWith('[') && kw.endsWith(']')) {
					matchType = enums.KeywordMatchType.EXACT
					text = kw.substring(1, kw.length - 1)
				} else if (kw.startsWith('"') && kw.endsWith('"')) {
					matchType = enums.KeywordMatchType.PHRASE
					text = kw.substring(1, kw.length - 1)
				}
				return {
					entity: 'ad_group_criterion',
					operation: 'create',
					resource: {
						ad_group: ResourceNames.adGroup(customerId, adGroupId),
						status: enums.AdGroupCriterionStatus.ENABLED,
						keyword: { text, match_type: matchType },
					},
				}
			})
			await customer.mutateResources(kwOps)
		}

		// RSAs
		const rsa = {
			headlines: adGroupData.headlines.map(text => ({ text })),
			descriptions: adGroupData.descriptions.map(text => ({ text })),
			path1: 'Knoxville',
			path2: 'MedSpa',
		}
		await customer.mutateResources([
			{
				entity: 'ad_group_ad',
				operation: 'create',
				resource: {
					ad_group: ResourceNames.adGroup(customerId, adGroupId),
					status: enums.AdGroupAdStatus.PAUSED,
					ad: {
						final_urls: [adGroupData.final_url],
						type: enums.AdType.RESPONSIVE_SEARCH_AD,
						responsive_search_ad: rsa,
					},
				},
			},
		])
	} catch (err) {
		console.error(
			`  ❌ Failed to sync Ad Group ${adGroupData.name}:`,
			err.message,
		)
	}
}

// ------------------------------------------------------------------
// PERFORMANCE MAX ASSET GROroups
// ------------------------------------------------------------------

async function syncPMaxAssetGroup(campaignId, pmaxData, globalAssets) {
	const agData = pmaxData.asset_group_1
	if (isDryRun) {
		console.log(`[DRY RUN] Would build PMax Asset Group: ${agData.name}`)
		return
	}

	console.log(`  Building PMax Asset Group: ${agData.name}...`)
	try {
		// 1. Create Asset Group
		const agRes = await customer.mutateResources([
			{
				entity: 'asset_group',
				operation: 'create',
				resource: {
					name: agData.name,
					campaign: ResourceNames.campaign(customerId, campaignId),
					final_urls: [pmaxData.final_url],
					status: enums.AssetGroupStatus.PAUSED,
				},
			},
		])
		const assetGroupResourceName = agRes.results[0].resource_name

		// 2. Map Assets
		const assetOps = []
		const linkAsset = (assetRn, fieldType) => {
			if (!assetRn) return
			assetOps.push({
				entity: 'asset_group_asset',
				operation: 'create',
				resource: {
					asset_group: assetGroupResourceName,
					asset: assetRn,
					field_type: fieldType,
				},
			})
		}

		// Images
		for (const imgPath of agData.images || []) {
			const rn = await getOrCreateImageAsset(imgPath)
			linkAsset(rn, enums.AssetFieldType.MARKETING_IMAGE)
		}
		// Logo
		if (globalAssets?.images?.logo) {
			const rn = await getOrCreateImageAsset(globalAssets.images.logo)
			linkAsset(rn, enums.AssetFieldType.LOGO)
		}

		// Texts
		for (const text of agData.headlines || []) {
			linkAsset(await getOrCreateTextAsset(text), enums.AssetFieldType.HEADLINE)
		}
		for (const text of agData.long_headlines || []) {
			linkAsset(
				await getOrCreateTextAsset(text),
				enums.AssetFieldType.LONG_HEADLINE,
			)
		}
		for (const text of agData.descriptions || []) {
			linkAsset(
				await getOrCreateTextAsset(text),
				enums.AssetFieldType.DESCRIPTION,
			)
		}

		// Business Name
		linkAsset(
			await getOrCreateTextAsset('Sarah Hitchcox Aesthetics'),
			enums.AssetFieldType.BUSINESS_NAME,
		)

		// Run mapping mutations
		if (assetOps.length > 0) {
			// Chunking by 10 or so if necessary, but we'll try a single payload
			await customer.mutateResources(assetOps)
			console.log(`  ✅ Linked ${assetOps.length} assets to PMax Group.`)
		}
	} catch (err) {
		console.error(`  ❌ Failed to build PMax Asset Group:`, err.message)
	}
}

// ------------------------------------------------------------------
// MAIN SYNC
// ------------------------------------------------------------------

async function runSync() {
	console.log('🚀 Starting Google Ads Full Sync (Images, Budgets, PMax)...\n')
	const data = loadCampaignData()
	const existingCampaigns = await getExistingCampaigns()

	// 1. BRAND SEARCH
	const brandName = 'Search - Brand Protection - 2026'
	const brandBudget = data.brandSearch.budget || 5
	let brandId = existingCampaigns[brandName]
	if (!brandId) {
		brandId = await createCampaignWithBudget(
			brandName,
			brandBudget,
			enums.AdvertisingChannelType.SEARCH,
		)
		if (brandId) await syncSearchAdGroup(brandId, data.brandSearch)
	} else console.log(`✅ Campaign "${brandName}" already exists.`)

	// 2. NON-BRAND SEARCH
	const nbName = 'Search - NonBrand MedSpa - 2026'
	// The budget property in wrinkle-relaxers.yaml is used as default non-brand budget
	const nbBudget = data.nonBrandSearchGroups[0]?.budget || 50
	let nbId = existingCampaigns[nbName]
	if (!nbId) {
		nbId = await createCampaignWithBudget(
			nbName,
			nbBudget,
			enums.AdvertisingChannelType.SEARCH,
		)
		if (nbId) {
			for (const ag of data.nonBrandSearchGroups)
				await syncSearchAdGroup(nbId, ag)
		}
	} else console.log(`✅ Campaign "${nbName}" already exists.`)

	// 3. PMAX
	const pmaxName = 'PMax - MedSpa Domination - 2026'
	const pmaxBudget = data.pmax.budget || 25
	let pmaxId = existingCampaigns[pmaxName]
	if (!pmaxId) {
		pmaxId = await createCampaignWithBudget(
			pmaxName,
			pmaxBudget,
			enums.AdvertisingChannelType.PERFORMANCE_MAX,
		)
		if (pmaxId) await syncPMaxAssetGroup(pmaxId, data.pmax, data.assets)
	} else console.log(`✅ Campaign "${pmaxName}" already exists.`)

	// 4. DEMAND GEN
	const dgName = 'Demand Gen - Retargeting - 2026'
	const dgBudget = data.demandGen.budget || 15
	let dgId = existingCampaigns[dgName]
	if (!dgId) {
		dgId = await createCampaignWithBudget(
			dgName,
			dgBudget,
			enums.AdvertisingChannelType.DEMAND_GEN,
		)
		// Note: Demand Gen uses similar Asset Group creation logic. PMax is implemented fully above.
	} else console.log(`✅ Campaign "${dgName}" already exists.`)

	console.log('\n🎉 Sync process complete.')
}

runSync().catch(console.error)
