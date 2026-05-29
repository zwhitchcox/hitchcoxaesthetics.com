import { redirect } from '@remix-run/node'

export async function loader() {
	return redirect('/lp/weight-loss-semaglutide', { status: 301 })
}

export default function LegacyMedicalWeightLossTelehealthRoute() {
	return null
}
