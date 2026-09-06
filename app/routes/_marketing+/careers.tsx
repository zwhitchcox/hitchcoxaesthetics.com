import { type MetaFunction } from '@remix-run/node'
import { getSocialMetas } from '#app/utils/seo.ts'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Careers | Sarah Hitchcox Aesthetics | Knoxville, TN',
		description:
			'Open positions at Sarah Hitchcox Aesthetics, a nurse-owned medical aesthetics practice with four West Knoxville offices: Licensed Esthetician and part-time Marketing and Patient Experience Assistant.',
		pathname: location.pathname,
	})

const POSTED = '2026-09-06'
const ORG = {
	'@type': 'Organization',
	name: 'Sarah Hitchcox Aesthetics',
	sameAs: 'https://hitchcoxaesthetics.com',
}
const BEARDEN = {
	'@type': 'Place',
	address: {
		'@type': 'PostalAddress',
		streetAddress: '5113 Kingston Pike, Suite 15',
		addressLocality: 'Knoxville',
		addressRegion: 'TN',
		postalCode: '37919',
		addressCountry: 'US',
	},
}
const jobs = [
	{
		slug: 'marketing-and-patient-experience-assistant',
		title: 'Marketing and Patient Experience Assistant',
		type: 'Part-time',
		pay: '$18 per hour, W-2',
		hours: '15 to 20 hours per week, weekdays, set around your schedule. No weekends.',
		where: 'Bearden (5113 Kingston Pike, Suite 15) and Farragut (102 S Campbell Station Rd, Suite 8)',
		summary:
			'You will split your time between the front desk and our marketing. You will work directly with the owner and see how a small medical practice runs.',
		duties: [
			'Greet patients and make sure intake and consent forms are complete before they see Sarah.',
			'Ask happy patients for Google reviews at checkout and keep our review requests moving.',
			'Take photos and short videos of patients (always with written consent), treatments, the offices, and the team, and post them to our Instagram, Facebook, and website.',
			'Keep our online listings accurate (Google Business Profile, directories, review sites).',
			'Light office support between patients: phones, scheduling questions, supplies.',
		],
		you: [
			'A current student or recent graduate in marketing, communications, nursing, health sciences, or a related field, or equivalent experience.',
			'Comfortable talking to people face to face and asking for a review.',
			'Basic phone photo and video skills. Canva or CapCut is a plus.',
			'Organized and reliable. You follow through on small tasks without reminders.',
			'Discreet with patient information. You will complete HIPAA training and sign a confidentiality agreement before your first shift.',
		],
		schema: {
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: 'Marketing and Patient Experience Assistant',
			description:
				'Part-time front desk and marketing role at a nurse-owned medical aesthetics practice in Knoxville, TN: patient intake, Google reviews, photos and social media, online listings.',
			datePosted: POSTED,
			employmentType: 'PART_TIME',
			hiringOrganization: ORG,
			jobLocation: BEARDEN,
			baseSalary: {
				'@type': 'MonetaryAmount',
				currency: 'USD',
				value: { '@type': 'QuantitativeValue', value: 18, unitText: 'HOUR' },
			},
			directApply: true,
		},
	},
	{
		slug: 'licensed-esthetician',
		title: 'Licensed Esthetician',
		type: 'Full-time or part-time',
		pay: 'Hourly, based on experience, plus commission on services and retail',
		hours: 'Full-time or part-time, weekdays',
		where: 'West Knoxville, with days at more than one of our four offices',
		summary:
			'You will deliver skincare services under the same roof as our nurse injector and help patients before and after their aesthetic treatments. A current Tennessee esthetician license is required. New graduates are welcome; we train.',
		duties: [
			'Facials, chemical peels, dermaplaning, and skincare consultations.',
			'Prepare patients for treatment and give after-care instructions.',
			'Recommend and sell the skincare lines we carry.',
			'Keep treatment rooms stocked and clean.',
			'If you enjoy it, help with patient photos (with consent), social media posts, and reviews. That is a plus, not a requirement.',
		],
		you: [
			'Tennessee esthetician license in good standing.',
			'Warm with patients, precise with protocols.',
			'Comfortable in a medical setting alongside a registered nurse.',
			'Reliable and organized.',
		],
		schema: {
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: 'Licensed Esthetician',
			description:
				'Licensed esthetician at a nurse-owned medical aesthetics practice with four West Knoxville offices: facials, chemical peels, dermaplaning, skincare consultations, pre- and post-treatment care. Tennessee esthetician license required.',
			datePosted: POSTED,
			employmentType: ['FULL_TIME', 'PART_TIME'],
			hiringOrganization: ORG,
			jobLocation: BEARDEN,
			directApply: true,
		},
	},
]

export default function Careers() {
	return (
		<div className="font-poppins bg-white py-16 lg:py-24">
			{jobs.map((job) => (
				<script
					key={job.slug}
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(job.schema) }}
				/>
			))}
			<div className="mx-auto max-w-3xl px-6 lg:px-8">
				<h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
					Careers
				</h1>
				<p className="mt-6 text-lg leading-relaxed text-gray-600">
					Sarah Hitchcox Aesthetics is a nurse-owned medical aesthetics
					practice with four West Knoxville offices: Bearden, Farragut, West
					Hills, and Cedar Bluff. The owner, Sarah Hitchcox, RN, works in the
					offices every day. We offer Botox and dermal fillers, laser hair
					removal, microneedling, skincare, and a medical weight loss program.
				</p>
				<p className="mt-4 text-lg leading-relaxed text-gray-600">
					To apply for either role, email{' '}
					<a
						className="font-medium text-primary underline"
						href="mailto:sarah@hitchcoxaesthetics.com"
					>
						sarah@hitchcoxaesthetics.com
					</a>{' '}
					with the job title in the subject line.
				</p>

				{jobs.map((job) => (
					<section
						key={job.slug}
						id={job.slug}
						className="mt-14 border-t border-gray-200 pt-10"
					>
						<h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
							{job.title}
						</h2>
						<dl className="mt-4 grid gap-2 text-gray-600 sm:grid-cols-[8rem_1fr]">
							<dt className="font-medium text-gray-900">Type</dt>
							<dd>{job.type}</dd>
							<dt className="font-medium text-gray-900">Where</dt>
							<dd>{job.where}</dd>
							<dt className="font-medium text-gray-900">Hours</dt>
							<dd>{job.hours}</dd>
							<dt className="font-medium text-gray-900">Pay</dt>
							<dd>{job.pay}</dd>
						</dl>
						<p className="mt-6 text-lg leading-relaxed text-gray-600">
							{job.summary}
						</p>
						<h3 className="mt-8 text-lg font-semibold text-gray-900">
							What you will do
						</h3>
						<ul className="mt-3 list-disc space-y-2 pl-6 text-gray-600">
							{job.duties.map((d) => (
								<li key={d}>{d}</li>
							))}
						</ul>
						<h3 className="mt-8 text-lg font-semibold text-gray-900">You</h3>
						<ul className="mt-3 list-disc space-y-2 pl-6 text-gray-600">
							{job.you.map((d) => (
								<li key={d}>{d}</li>
							))}
						</ul>
						<p className="mt-8">
							<a
								className="inline-block rounded-md bg-primary px-5 py-3 font-medium text-white"
								href={`mailto:sarah@hitchcoxaesthetics.com?subject=${encodeURIComponent(job.title)}`}
							>
								Apply by email
							</a>
						</p>
					</section>
				))}

				<p className="mt-14 border-t border-gray-200 pt-8 text-gray-600">
					In your email, include a short note on why this fits you and your
					availability. For the assistant role, add any photo, video, or social
					work you are proud of (links are fine). For the esthetician role,
					include your license number and experience.
				</p>
			</div>
		</div>
	)
}
