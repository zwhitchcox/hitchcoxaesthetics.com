import {
	getFormProps,
	getInputProps,
	getSelectProps,
	getTextareaProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	json,
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
	type ActionFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { ErrorList, Field, TextareaField } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { sendEmail } from '#app/utils/email.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { getSocialMetas } from '#app/utils/seo.ts'

export const meta: MetaFunction = ({ location }) =>
	getSocialMetas({
		title: 'Careers | Sarah Hitchcox Aesthetics | Knoxville, TN',
		description:
			'Open positions at Sarah Hitchcox Aesthetics, a nurse-owned medical aesthetics practice with four West Knoxville offices: Licensed Medical Aesthetician and part-time Marketing and Patient Experience Assistant.',
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
		slug: 'licensed-medical-aesthetician',
		title: 'Licensed Medical Aesthetician (LMA)',
		type: 'Full-time or part-time',
		pay: 'Hourly, based on experience, plus commission on services and retail',
		hours: 'Full-time or part-time, weekdays',
		where: 'West Knoxville, with days at more than one of our four offices',
		summary:
			'You will deliver medical-grade skincare services under the same roof as our nurse injector and help patients before and after their aesthetic treatments. We hire Licensed Medical Aestheticians only: a Tennessee esthetician license plus medical aesthetics training or certification and experience in a medical setting. An esthetician license on its own does not meet the requirement.',
		duties: [
			'Facials, chemical peels, dermaplaning, and skincare consultations.',
			'Prepare patients for treatment and give after-care instructions.',
			'Recommend and sell the skincare lines we carry.',
			'Keep treatment rooms stocked and clean.',
			'If you enjoy it, help with patient photos (with consent), social media posts, and reviews. That is a plus, not a requirement.',
		],
		you: [
			'Licensed Medical Aesthetician: Tennessee esthetician license in good standing plus medical aesthetics certification or documented medical-setting training. Esthetician license alone does not qualify.',
			'Warm with patients, precise with protocols.',
			'Comfortable in a medical setting alongside a registered nurse.',
			'Reliable and organized.',
		],
		schema: {
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: 'Licensed Medical Aesthetician (LMA)',
			description:
				'Licensed Medical Aesthetician at a nurse-owned medical aesthetics practice with four West Knoxville offices: facials, chemical peels, dermaplaning, skincare consultations, pre- and post-treatment care. Licensed Medical Aesthetician required: Tennessee esthetician license plus medical aesthetics certification or medical-setting experience; an esthetician license alone does not qualify.',
			datePosted: POSTED,
			employmentType: ['FULL_TIME', 'PART_TIME'],
			hiringOrganization: ORG,
			jobLocation: BEARDEN,
			directApply: true,
		},
	},
]

const APPLY_TO = 'sarah@hitchcoxaesthetics.com'
const ROLE_SLUGS = [
	'marketing-and-patient-experience-assistant',
	'licensed-medical-aesthetician',
] as const
const RESUME_TYPES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const RESUME_MAX_BYTES = 5 * 1024 * 1024

const ApplicationSchema = z.object({
	name: z.string({ required_error: 'Your name' }).trim().min(2, 'Your name').max(120),
	email: z
		.string({ required_error: 'An email address we can reply to' })
		.trim()
		.email('A real email address, so we can reply')
		.max(200),
	phone: z.string().trim().max(40).optional(),
	role: z.enum(ROLE_SLUGS, { errorMap: () => ({ message: 'Pick the role' }) }),
	message: z
		.string({ required_error: 'Tell us a little about yourself' })
		.trim()
		.min(20, 'Tell us a little about yourself: a few sentences')
		.max(5000),
	links: z.string().trim().max(1000).optional(),
	resume: z.any().optional(),
})

/**
 * The application form (Zane, 2026-09-09). Every application lands in the
 * practice inbox with the subject "Job application: <role> - <name>", so the
 * Gmail filter files it under the "Job applications" label for Sarah. The
 * resume rides along as an attachment and a reply goes straight to the
 * applicant.
 */
export async function action({ request }: ActionFunctionArgs) {
	const formData = await unstable_parseMultipartFormData(
		request,
		unstable_createMemoryUploadHandler({ maxPartSize: RESUME_MAX_BYTES }),
	)
	checkHoneypot(formData)
	const submission = parseWithZod(formData, { schema: ApplicationSchema })
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply(), sent: false },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	const attachments: Array<{ filename: string; content: string }> = []
	const resume = formData.get('resume')
	if (resume instanceof File && resume.size > 0) {
		if (!RESUME_TYPES.has(resume.type)) {
			return json(
				{
					result: submission.reply({
						fieldErrors: { resume: ['A PDF or Word file, please'] },
					}),
					sent: false,
				},
				{ status: 400 },
			)
		}
		attachments.push({
			filename: resume.name.replace(/[^\w.-]+/g, '_').slice(0, 120) || 'resume',
			content: Buffer.from(await resume.arrayBuffer()).toString('base64'),
		})
	}
	const { name, email, phone, role, message, links } = submission.value
	const title = jobs.find((j) => j.slug === role)?.title ?? role
	const lines = [
		`Role: ${title}`,
		`Name: ${name}`,
		`Email: ${email}`,
		`Phone: ${phone || 'not given'}`,
		`Links: ${links || 'none'}`,
		'',
		message,
		'',
		attachments.length
			? `Resume attached: ${attachments[0]!.filename}`
			: 'No resume attached.',
		'',
		'Sent from the application form on hitchcoxaesthetics.com/careers.',
	]
	const escape = (s: string) =>
		s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
	const sent = await sendEmail({
		to: APPLY_TO,
		replyTo: email,
		subject: `Job application: ${title} - ${name}`,
		text: lines.join('\n'),
		html: `<pre style="font-family:inherit;white-space:pre-wrap">${escape(lines.join('\n'))}</pre>`,
		attachments,
	})
	if (sent.status !== 'success') {
		return json(
			{
				result: submission.reply({
					formErrors: [
						`We could not send your application just now. Please email it to ${APPLY_TO} instead.`,
					],
				}),
				sent: false,
			},
			{ status: 500 },
		)
	}
	return json({ result: submission.reply({ resetForm: true }), sent: true })
}

export default function Careers() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'job-application',
		constraint: getZodConstraint(ApplicationSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ApplicationSchema })
		},
		shouldRevalidate: 'onBlur',
	})
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
					To apply for either role, use the{' '}
					<a className="font-medium text-primary underline" href="#apply">
						application form
					</a>{' '}
					below, or email{' '}
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
								href="#apply"
							>
								Apply
							</a>
						</p>
					</section>
				))}

				<section id="apply" className="mt-14 border-t border-gray-200 pt-10">
					<h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
						Apply
					</h2>
					<p className="mt-4 text-lg leading-relaxed text-gray-600">
						Tell us why this fits you and your availability. For the assistant
						role, add any photo, video, or social work you are proud of (links
						are fine). For the medical aesthetician role, include your license
						number, your medical aesthetics certification, and where you have
						worked in a medical setting.
					</p>
					{actionData?.sent ? (
						<p className="mt-6 rounded-md bg-green-50 p-4 text-green-900">
							Thank you. Your application is in Sarah&apos;s inbox, and she
							replies to the email address you gave.
						</p>
					) : null}
					<Form
						method="POST"
						encType="multipart/form-data"
						className="mt-6"
						{...getFormProps(form)}
					>
						<HoneypotInputs />
						<Field
							labelProps={{ children: 'Your name' }}
							inputProps={{
								...getInputProps(fields.name, { type: 'text' }),
								autoComplete: 'name',
							}}
							errors={fields.name.errors}
						/>
						<Field
							labelProps={{ children: 'Email' }}
							inputProps={{
								...getInputProps(fields.email, { type: 'email' }),
								autoComplete: 'email',
							}}
							errors={fields.email.errors}
						/>
						<Field
							labelProps={{ children: 'Phone (optional)' }}
							inputProps={{
								...getInputProps(fields.phone, { type: 'tel' }),
								autoComplete: 'tel',
							}}
							errors={fields.phone.errors}
						/>
						<div>
							<label
								htmlFor={fields.role.id}
								className="text-sm font-medium text-gray-900"
							>
								Role
							</label>
							<select
								{...getSelectProps(fields.role)}
								className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900"
							>
								<option value="">Choose a role</option>
								{jobs.map((job) => (
									<option key={job.slug} value={job.slug}>
										{job.title}
									</option>
								))}
							</select>
							<div className="min-h-[32px] px-4 pb-3 pt-1">
								<ErrorList id={fields.role.errorId} errors={fields.role.errors} />
							</div>
						</div>
						<TextareaField
							labelProps={{ children: 'About you' }}
							textareaProps={{
								...getTextareaProps(fields.message),
								rows: 6,
								placeholder:
									'Why this role, your availability, and your experience.',
							}}
							errors={fields.message.errors}
						/>
						<Field
							labelProps={{
								children: 'Links (optional): portfolio, Instagram, LinkedIn',
							}}
							inputProps={{ ...getInputProps(fields.links, { type: 'text' }) }}
							errors={fields.links.errors}
						/>
						<div>
							<label
								htmlFor="resume"
								className="text-sm font-medium text-gray-900"
							>
								Resume (PDF or Word, optional)
							</label>
							<input
								id="resume"
								name="resume"
								type="file"
								accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
								className="mt-1 block w-full text-gray-900"
							/>
							<div className="min-h-[32px] px-4 pb-3 pt-1">
								<ErrorList id="resume-error" errors={fields.resume.errors} />
							</div>
						</div>
						<ErrorList id={form.errorId} errors={form.errors} />
						<StatusButton
							type="submit"
							status={isPending ? 'pending' : 'idle'}
							disabled={isPending}
						>
							Send application
						</StatusButton>
					</Form>
				</section>
			</div>
		</div>
	)
}
