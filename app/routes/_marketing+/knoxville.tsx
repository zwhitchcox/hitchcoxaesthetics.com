import { redirect } from '@remix-run/node'

export function loader() {
	return redirect('/bearden', { status: 301 })
}
