import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { z } from 'zod'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export const FieldTypeSchema = z.enum([
	'YesNo',
	'YesNoDetails',
	'YesNoNA',
	'MultiSelect',
	'Select',
	'Text',
])
export const FieldType = FieldTypeSchema.enum
export type FieldType = z.infer<typeof FieldTypeSchema>

export const YesNoNASchema = z.enum(['Yes', 'No', 'NA'])
export const YesNoNA = YesNoNASchema.enum
export type YesNoNA = z.infer<typeof YesNoNASchema>
