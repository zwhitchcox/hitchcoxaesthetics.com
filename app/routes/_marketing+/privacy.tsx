import { type MetaFunction } from '@remix-run/node'
import { Link } from '@remix-run/react'

export const meta: MetaFunction = () => [
	{
		title: 'Privacy Policy | Sarah Hitchcox Aesthetics',
	},
	{
		name: 'description',
		content:
			'Privacy policy for Sarah Hitchcox Aesthetics including HIPAA notice, SMS consent, and data use practices.',
	},
]

export default function PrivacyRoute() {
	return (
		<div className="font-poppins mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
			<h1 className="mb-8 text-3xl font-bold text-gray-900">Privacy Policy</h1>
			<p className="mb-8 text-sm text-gray-500">Last updated: February 2026</p>

			{/* SMS / Text Message Consent */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					SMS / Text Message Consent &amp; Policy
				</h2>
				<p className="mb-4 text-gray-700">
					By providing your phone number and opting in, you consent to receive
					text messages (SMS and MMS) from Sarah Hitchcox Aesthetics. Messages
					may include:
				</p>
				<ul className="mb-4 list-disc space-y-1 pl-6 text-gray-700">
					<li>Appointment reminders and confirmations</li>
					<li>Follow-up care instructions</li>
					<li>Promotional offers and special event invitations</li>
					<li>Responses to your inquiries</li>
				</ul>
				<p className="mb-4 text-gray-700">
					<strong>Message frequency varies.</strong> Message and data rates may
					apply depending on your mobile carrier and plan. You are not required
					to consent to text messaging as a condition of purchasing any
					services.
				</p>
				<p className="mb-4 text-gray-700">
					<strong>To opt out</strong> of text messages at any time, reply{' '}
					<strong>STOP</strong> to any message you receive from us. After opting
					out, you will receive a one-time confirmation message. You will no
					longer receive text messages from us unless you opt in again.
				</p>
				<p className="mb-4 text-gray-700">
					<strong>For help,</strong> reply <strong>HELP</strong> to any message
					or contact us at{' '}
					<Link
						to="tel:8652147238"
						reloadDocument
						className="text-primary underline hover:no-underline"
					>
						(865) 214-7238
					</Link>{' '}
					or{' '}
					<Link
						to="mailto:info@hitchcoxaesthetics.com"
						reloadDocument
						className="text-primary underline hover:no-underline"
					>
						info@hitchcoxaesthetics.com
					</Link>
					.
				</p>
				<div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
					<p className="font-semibold text-gray-900">
						SMS consent is not shared with third parties or affiliates.
					</p>
					<p className="mt-2 text-gray-700">
						No mobile information, including SMS consent or opt-in data, will be
						shared with third parties or affiliates for marketing or promotional
						purposes. Disclosure of mobile information is strictly limited to:
						service providers we use to help deliver text messages (e.g.,
						messaging platform providers), as required by law, and as necessary
						to protect our rights.
					</p>
				</div>
				<p className="text-gray-700">
					Supported carriers include but are not limited to AT&amp;T, T-Mobile,
					Verizon, Sprint, and other major U.S. carriers. Carriers are not
					liable for delayed or undelivered messages.
				</p>
			</section>

			{/* General Privacy Practices */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					Information We Collect
				</h2>
				<p className="mb-4 text-gray-700">
					We collect personal information you provide directly to us, including:
				</p>
				<ul className="mb-4 list-disc space-y-1 pl-6 text-gray-700">
					<li>
						Name, email address, phone number, and mailing address when you book
						an appointment or contact us
					</li>
					<li>
						Health and medical history as part of your treatment consultations
					</li>
					<li>
						Payment information processed securely through our payment providers
					</li>
					<li>
						Website usage data collected through cookies and analytics tools
						(e.g., pages visited, browser type, IP address)
					</li>
					<li>
						SMS opt-in status and phone number when you consent to receive text
						messages
					</li>
				</ul>
			</section>

			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					How We Use Your Information
				</h2>
				<p className="mb-4 text-gray-700">
					We use the information we collect to:
				</p>
				<ul className="mb-4 list-disc space-y-1 pl-6 text-gray-700">
					<li>Provide, maintain, and improve our services</li>
					<li>
						Send appointment reminders, follow-up care instructions, and service
						updates via email, phone, or text message
					</li>
					<li>
						Process payments and maintain records as required for healthcare
						providers
					</li>
					<li>
						Communicate with you about promotions, events, and new services
						(with your consent)
					</li>
					<li>Respond to your inquiries and support requests</li>
					<li>Comply with legal obligations</li>
				</ul>
			</section>

			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					Who We Share Your Information With
				</h2>
				<p className="mb-4 text-gray-700">
					We do not sell your personal information. We may share your
					information only in the following limited circumstances:
				</p>
				<ul className="mb-4 list-disc space-y-1 pl-6 text-gray-700">
					<li>
						<strong>Service providers:</strong> Third-party vendors who assist
						us in operating our business, such as appointment scheduling
						platforms, payment processors, messaging platforms, and analytics
						tools. These providers are contractually obligated to protect your
						data and may only use it to perform services on our behalf.
					</li>
					<li>
						<strong>Healthcare providers:</strong> Other providers involved in
						your care, as described in our HIPAA Notice below.
					</li>
					<li>
						<strong>Legal requirements:</strong> When required by law, subpoena,
						court order, or government regulation.
					</li>
					<li>
						<strong>Safety:</strong> When necessary to protect the rights,
						safety, or property of Sarah Hitchcox Aesthetics, our patients, or
						the public.
					</li>
				</ul>
				<p className="font-semibold text-gray-900">
					SMS consent and mobile information are never shared with third parties
					or affiliates for marketing or promotional purposes.
				</p>
			</section>

			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					Data Security
				</h2>
				<p className="text-gray-700">
					We implement appropriate technical and organizational measures to
					protect your personal information against unauthorized access,
					alteration, disclosure, or destruction. This includes encryption of
					sensitive data, secure storage systems, and access controls limiting
					who can view your information.
				</p>
			</section>

			{/* HIPAA Notice */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					HIPAA Notice of Privacy Practices
				</h2>
				<p className="mb-4 text-sm font-semibold uppercase text-gray-600">
					This notice describes how medical information about you may be used
					and disclosed and how you can get access to this information. Please
					review it carefully.
				</p>
				<p className="mb-4 text-gray-700">
					This Notice of Privacy Practices describes how we may use and disclose
					your protected health information to carry out treatment, payment or
					health care operations and for other purposes that are permitted or
					required by law. It also describes your rights to access and control
					your protected health information. &ldquo;Protected health
					information&rdquo; is information about you, including demographic
					information, that may identify you and that relates to your past,
					present or future physical or mental health or condition and related
					health care services.
				</p>
				<p className="mb-4 text-gray-700">
					We are required to abide by the terms of this Notice of Privacy
					Practices. We may change the terms of our notice at any time. The new
					notice will be effective for all protected health information that we
					maintain at that time. Upon your request, we will provide you with any
					revised Notice of Privacy Practices.
				</p>

				<h3 className="mb-3 mt-8 text-xl font-semibold text-gray-900">
					1. Uses and Disclosures of Protected Health Information
				</h3>
				<p className="mb-4 text-gray-700">
					Your protected health information may be used and disclosed by your
					provider, our office staff and others outside of our office who are
					involved in your care and treatment for the purpose of providing
					health care services to you. Your protected health information may
					also be used and disclosed to pay your health care bills and to
					support the operation of our practice.
				</p>

				<h4 className="mb-2 mt-4 font-semibold text-gray-900">Treatment</h4>
				<p className="mb-4 text-gray-700">
					We will use and disclose your protected health information to provide,
					coordinate, or manage your health care and any related services. This
					includes the coordination or management of your health care with
					another provider. We will also disclose protected health information
					to other providers who may be treating you.
				</p>

				<h4 className="mb-2 mt-4 font-semibold text-gray-900">Payment</h4>
				<p className="mb-4 text-gray-700">
					Your protected health information will be used and disclosed, as
					needed, to obtain payment for your health care services provided by us
					or by another provider. This may include certain activities that your
					health insurance plan may undertake before it approves or pays for the
					health care services we recommend for you.
				</p>

				<h4 className="mb-2 mt-4 font-semibold text-gray-900">
					Health Care Operations
				</h4>
				<p className="mb-4 text-gray-700">
					We may use or disclose, as needed, your protected health information
					in order to support the business activities of our practice. These
					activities include, but are not limited to, quality assessment
					activities, employee review activities, training, licensing,
					fundraising activities, and conducting or arranging for other business
					activities.
				</p>

				<h4 className="mb-2 mt-4 font-semibold text-gray-900">
					Other Permitted Uses and Disclosures
				</h4>
				<p className="mb-4 text-gray-700">
					We may use or disclose your protected health information without your
					authorization in situations including: as required by law, for public
					health activities, communicable disease reporting, health oversight
					activities, abuse or neglect reporting, Food and Drug Administration
					reporting, legal proceedings, law enforcement purposes, coroners and
					funeral directors, research, to prevent a serious threat to health or
					safety, military activity and national security, workers&apos;
					compensation, and for inmates of correctional facilities.
				</p>

				<h4 className="mb-2 mt-4 font-semibold text-gray-900">
					Uses Requiring Your Written Authorization
				</h4>
				<p className="mb-4 text-gray-700">
					Other uses and disclosures of your protected health information will
					be made only with your written authorization, unless otherwise
					permitted or required by law. You may revoke this authorization in
					writing at any time.
				</p>

				<h3 className="mb-3 mt-8 text-xl font-semibold text-gray-900">
					2. Your Rights
				</h3>
				<ul className="mb-4 list-disc space-y-3 pl-6 text-gray-700">
					<li>
						<strong>Right to inspect and copy</strong> your protected health
						information. We may charge a reasonable fee for copies.
					</li>
					<li>
						<strong>Right to request restrictions</strong> on uses and
						disclosures of your protected health information for treatment,
						payment, or health care operations.
					</li>
					<li>
						<strong>Right to request confidential communications</strong> by
						alternative means or at an alternative location.
					</li>
					<li>
						<strong>Right to request amendment</strong> of your protected health
						information in a designated record set.
					</li>
					<li>
						<strong>Right to receive an accounting</strong> of certain
						disclosures we have made of your protected health information.
					</li>
					<li>
						<strong>Right to obtain a paper copy</strong> of this notice upon
						request.
					</li>
				</ul>
			</section>

			{/* Contact */}
			<section className="mb-12">
				<h2 className="mb-4 text-2xl font-semibold text-gray-900">
					Contact Us
				</h2>
				<p className="text-gray-700">
					If you have questions about this Privacy Policy, your rights, or our
					practices, please contact us:
				</p>
				<ul className="mt-4 space-y-2 text-gray-700">
					<li>
						<strong>Phone:</strong>{' '}
						<Link
							to="tel:8652147238"
							reloadDocument
							className="text-primary underline hover:no-underline"
						>
							(865) 214-7238
						</Link>
					</li>
					<li>
						<strong>Email:</strong>{' '}
						<Link
							to="mailto:info@hitchcoxaesthetics.com"
							reloadDocument
							className="text-primary underline hover:no-underline"
						>
							info@hitchcoxaesthetics.com
						</Link>
					</li>
					<li>
						<strong>Address:</strong> 5113 Kingston Pike, Suite 15, Knoxville,
						TN 37919
					</li>
				</ul>
			</section>
		</div>
	)
}
