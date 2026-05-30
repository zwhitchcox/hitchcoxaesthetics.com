import {
	type RetellBookingBrandConfig,
	DEFAULT_RETELL_BOOKING_BRAND,
} from './retell-booking-agent-config.ts'

export type RetellBookingBrandKey = 'botox-knox' | 'sarah' | 'weight-loss-knox'

export type RetellBookingAgentBrand = RetellBookingBrandConfig & {
	agentId?: string
	agentName: string
	agentIdEnv: string
	agentDisplayName: string
	llmId?: string
	llmIdEnv: string
	phoneNumber?: string
	phoneNumberEnv: string
}

export const RETELL_BOOKING_AGENT_BRANDS: Record<
	RetellBookingBrandKey,
	RetellBookingAgentBrand
> = {
	sarah: {
		...DEFAULT_RETELL_BOOKING_BRAND,
		agentDisplayName: 'Adrian',
		agentId: 'agent_01931c39dd6b893c7653b3c4a1',
		agentIdEnv: 'RETELL_SARAH_AGENT_ID',
		agentName: 'Sarah Hitchcox Aesthetics',
		llmId: 'llm_38fbe0cdbd676e87e1e3baf13c08',
		llmIdEnv: 'RETELL_SARAH_LLM_ID',
		phoneNumber: '+18653452258',
		phoneNumberEnv: 'RETELL_SARAH_PHONE_NUMBER',
	},
	'botox-knox': {
		agentDisplayName: 'Adrian',
		agentId: 'agent_2d6a0de3088f3066a2081539c0',
		agentIdEnv: 'RETELL_BOTOX_KNOX_AGENT_ID',
		agentName: 'Botox Knox',
		businessName: 'Botox Knox',
		llmId: 'llm_c088989b29e101e6776ef29f6d57',
		llmIdEnv: 'RETELL_BOTOX_KNOX_LLM_ID',
		phoneNumber: '+18657612898',
		phoneNumberEnv: 'RETELL_BOTOX_KNOX_PHONE_NUMBER',
		serviceFocus: 'botox',
	},
	'weight-loss-knox': {
		agentDisplayName: 'Adrian',
		agentId: 'agent_ba54c0b712bf2771c8d4209c7b',
		agentIdEnv: 'RETELL_WEIGHT_LOSS_KNOX_AGENT_ID',
		agentName: 'Weight Loss Knox',
		businessName: 'Weight Loss Knox',
		llmId: 'llm_3ba3e20ace66b249855a2c11f9b7',
		llmIdEnv: 'RETELL_WEIGHT_LOSS_KNOX_LLM_ID',
		phoneNumber: '+18653904907',
		phoneNumberEnv: 'RETELL_WEIGHT_LOSS_KNOX_PHONE_NUMBER',
		serviceFocus: 'weight-loss',
	},
}

export function getRetellBookingAgentBrand(key: RetellBookingBrandKey) {
	const brand = RETELL_BOOKING_AGENT_BRANDS[key]
	return {
		...brand,
		agentId: process.env[brand.agentIdEnv]?.trim() || brand.agentId,
		llmId: process.env[brand.llmIdEnv]?.trim() || brand.llmId,
		phoneNumber: process.env[brand.phoneNumberEnv]?.trim() || brand.phoneNumber,
	}
}

export function getRetellBookingAgentBrandKeys() {
	return Object.keys(RETELL_BOOKING_AGENT_BRANDS) as RetellBookingBrandKey[]
}
