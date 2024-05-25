export function dateToMinutes(date: Date) {
	return date.getHours() * 60 + date.getMinutes()
}

export function zToEST(date: Date | string) {
	date = toDate(date)
	const offset = date.getTimezoneOffset()
	date.setHours(date.getHours() - offset / 60)
	return date
}

const toDate = (date: string | Date) => {
	if (date instanceof Date) {
		return date
	}
	return new Date(date)
}
