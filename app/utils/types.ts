import { z } from 'zod'

export const DayOfWeekSchema = z.enum([
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
])
export const DayOfWeek = DayOfWeekSchema.enum
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>

export const UserTypeSchema = z.enum(['Provider', 'Client'])
export const UserType = UserTypeSchema.enum
export type UserType = z.infer<typeof UserTypeSchema>

export const AppointmentStatusSchema = z.enum(['Active', 'Cancelled'])
export const AppointmentStatus = AppointmentStatusSchema.enum
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>

export const SexSchema = z.enum(['Male', 'Female'])
export const Sex = SexSchema.enum
export type Sex = z.infer<typeof SexSchema>
