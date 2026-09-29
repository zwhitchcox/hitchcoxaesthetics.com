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
			'Open position at Sarah Hitchcox Aesthetics, a nurse-owned medical aesthetics practice with offices in Bearden and Farragut: part-time Licensed Medical Aesthetician with flexible daytime and evening hours.',
		pathname: location.pathname,
	})

const POSTED = '2026-09-29'
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
		slug: 'licensed-medical-aesthetician',
		title: 'Licensed Medical Aesthetician (LMA)',
		type: 'Part-time, flexible hours',
		pay: 'Hourly, based on experience, plus commission on services and retail',
		hours:
			'Daytime and evening shifts, set around your availability and our patients\' appointments. We post your schedule at least one week ahead.',
		where: 'Bearden (5113 Kingston Pike, Suite 15) and Farragut (102 S Campbell Station Rd, Suite 8)',
		summary:
			'You will give medical-grade skincare treatments and help run the patient side of the practice: forms, good faith exams, before-and-after photos, Google reviews, and some marketing. The job starts with a few hours a week. As we book more patients, your hours grow. It fits someone who wants to build a book of patients with us, not someone who needs full-time hours on day one. We hire Licensed Medical Aestheticians only: a Tennessee esthetician license plus medical aesthetics training or certification. An esthetician license on its own does not meet the requirement.',
		duties: [
			'Facials, chemical peels, dermaplaning, and skincare consultations.',
			'Prepare patients for treatment and give after-care instructions.',
			'Help patients complete their intake and consent forms and their good faith exam with our medical provider.',
			'Take before-and-after photos, always with the patient\'s written consent.',
			'Ask happy patients for Google reviews at checkout and keep our review requests moving.',
			'Take photos and short videos of treatments, the offices, and the team (with written consent) for our Instagram, Facebook, and website.',
			'Keep our online listings accurate.',
			'Recommend the skincare lines we carry, rebook your patients, and help fill your own schedule.',
			'Office work between patients: phones, scheduling questions, supplies, and treatment room upkeep.',
		],
		you: [
			'Licensed Medical Aesthetician: Tennessee esthetician license in good standing plus medical aesthetics certification or documented medical-setting training. An esthetician license alone does not qualify.',
			'Part-time availability that includes some evenings. Your hours start low and grow as we book more patients.',
			'Comfortable asking patients for a review, and able to take good photos and short videos on a phone.',
			'Discreet with patient information. You will complete HIPAA training and sign a confidentiality agreement before your first shift.',
			'Comfortable in a medical setting alongside a registered nurse.',
			'Warm with patients, precise with protocols, organized, and reliable.',
		],
		schema: {
			'@context': 'https://schema.org',
			'@type': 'JobPosting',
			title: 'Licensed Medical Aesthetician (LMA)',
			description:
				'Part-time Licensed Medical Aesthetician with flexible daytime and evening hours at a nurse-owned medical aesthetics practice with offices in Bearden and Farragut, Knoxville, TN: facials, chemical peels, dermaplaning, skincare consultations, patient forms and good faith exams, before-and-after photos, Google reviews, and some marketing. Hours start low and grow with bookings. Tennessee esthetician license plus medical aesthetics certification or medical-setting training required; an esthetician license alone does not qualify.',
			datePosted: POSTED,
			employmentType: 'PART_TIME',
			hiringOrganization: ORG,
			jobLocation: BEARDEN,
			directApply: true,
		},
	},
]

const APPLY_TO = 'sarah@hitchcoxaesthetics.com'
const ROLE_SLUGS = ['licensed-medical-aesthetician'] as const
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
					practice with two West Knoxville offices: Bearden and Farragut. The owner, Sarah Hitchcox, RN, BSN, works in the
					offices every day. We offer Botox and dermal fillers, laser hair
					removal, microneedling, skincare, and a medical weight loss program.
				</p>
				<p className="mt-4 text-lg leading-relaxed text-gray-600">
					To apply, use the{' '}
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
						Tell us which days and times you can work, including evenings. Include
						your Tennessee esthetician license number, your medical aesthetics
						certification, and where you have worked in a medical setting. Photo,
						video, or social media work you are proud of is welcome too (links are
						fine).
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
