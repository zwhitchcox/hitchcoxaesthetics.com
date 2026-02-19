import { redirect } from '@remix-run/node'

export function loader() {
	return redirect('/knoxville-med-spa', { status: 301 })
}
