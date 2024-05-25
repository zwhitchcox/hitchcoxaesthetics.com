import { useParams } from '@remix-run/react'

export default function () {
	const { slug } = useParams()
	return <div>slug: {slug}</div>
}
