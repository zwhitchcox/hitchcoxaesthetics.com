import { type Session } from '@remix-run/node'
import { type TypedSession } from 'remix-utils/typed-session'
import { type ZodTypeAny } from 'zod'

export function resetSessionData(session: Session | TypedSession<ZodTypeAny>) {
	for (const key of Object.keys(session.data)) {
		session.unset(key)
	}
}
