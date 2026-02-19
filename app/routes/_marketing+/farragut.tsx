import { redirect } from '@remix-run/node'

export function loader() {
	return redirect('/farragut-med-spa', { status: 301 })
}
