import { createHmac } from 'node:crypto'

export type BlvdAdminLocation = {
	id: string
	name?: string | null
	tz?: string | null
}

export async function boulevardAdminFetch<TData>(
	query: string,
	variables?: Record<string, unknown>,
) {
	const response = await boulevardAdminRequest(query, variables)
	let payload = (await response.json().catch(() => null)) as {
		data?: TData
		errors?: Array<{ message?: string }>
	} | null

	if (response.status === 401) {
		await sleep(1200)
		const retryResponse = await boulevardAdminRequest(query, variables)
		payload = (await retryResponse.json().catch(() => null)) as {
			data?: TData
			errors?: Array<{ message?: string }>
		} | null
		if (!retryResponse.ok || payload?.errors?.length || !payload?.data) {
			throw new Error(
				`Boulevard Admin API failed: ${JSON.stringify(
					payload?.errors ?? payload ?? { status: retryResponse.status },
				)}`,
			)
		}
		return payload.data
	}

	if (!response.ok || payload?.errors?.length || !payload?.data) {
		throw new Error(
			`Boulevard Admin API failed: ${JSON.stringify(
				payload?.errors ?? payload ?? { status: response.status },
			)}`,
		)
	}
	return payload.data
}

export async function listBlvdAdminLocations() {
	const response = await boulevardAdminFetch<{
		locations?: {
			edges?: Array<{
				node?: BlvdAdminLocation | null
			}>
		}
	}>(`query Locations {
		locations(first: 100) {
			edges {
				node {
					id
					name
					tz
				}
			}
		}
	}`)
	return (
		response.locations?.edges
			?.map(edge => edge.node)
			.filter((location): location is BlvdAdminLocation =>
				Boolean(location?.id),
			) ?? []
	)
}

async function boulevardAdminRequest(
	query: string,
	variables?: Record<string, unknown>,
) {
	return fetch('https://dashboard.boulevard.io/api/2020-01/admin', {
		body: JSON.stringify({ query, variables }),
		headers: {
			Accept: 'application/json',
			Authorization: generateAdminAuthorizationHeader(),
			'Content-Type': 'application/json',
		},
		method: 'POST',
	})
}

function generateAdminAuthorizationHeader() {
	const apiKey = process.env['BLVD_API_KEY']?.trim()
	const businessId = process.env['BLVD_BUSINESS_ID']?.trim()
	if (!apiKey || !businessId) {
		throw new Error('BLVD_API_KEY and BLVD_BUSINESS_ID are required.')
	}
	const token = generateSignedBlvdToken('blvd-admin-v1', businessId)
	return `Basic ${Buffer.from(`${apiKey}:${token}`).toString('base64')}`
}

function generateSignedBlvdToken(
	prefix: 'blvd-admin-v1' | 'blvd-client-v1',
	businessId: string,
	clientId = '',
) {
	const secretKey = process.env['BLVD_SECRET_KEY']?.trim()
	if (!secretKey) throw new Error('BLVD_SECRET_KEY is required.')
	const payload = `${prefix}${businessId}${clientId}${Math.floor(
		Date.now() / 1000,
	)}`
	const signature = createHmac('sha256', Buffer.from(secretKey, 'base64'))
		.update(payload)
		.digest('base64')
	return `${signature}${payload}`
}

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}
