import { redirect } from '@remix-run/node'

export async function loader() {
	return redirect('/lp/medical-weight-loss-telehealth', { status: 301 })
}

export default function LegacyTelehealthWeightLossRoute() {
	return null
}
