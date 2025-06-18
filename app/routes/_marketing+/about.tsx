import { Card } from '#app/components/ui/card.js'

export default function About() {
	return (
		<div className="mx-8 flex w-full flex-col items-center justify-center space-y-8 py-8">
			<Card className="w-full max-w-4xl p-4">
				<h1 className="mb-6 border-b pb-2 text-3xl font-semibold text-gray-800">
					About
				</h1>
				<div className="flex flex-col space-y-4 md:flex-row md:space-x-6 md:space-y-0">
					<img
						src={`img/sarah.jpg`}
						alt="Sarah Hitchcox"
						className="w-full rounded-lg object-cover shadow-md md:w-1/3"
					/>
					<div className="flex w-full flex-col space-y-4 md:w-2/3">
						<p className="text-xl text-gray-700">
							Sarah Hitchcox, a Knoxville native and dedicated Registered Nurse,
							specializes in medical aesthetics, bringing a unique combination
							of clinical expertise and a passion for enhancing natural beauty
							to the Knoxville and Farragut area. With a background primarily in
							the emergency department, Sarah has developed a profound
							understanding of patient care and empathy, skills that she now
							applies in the field of medical aesthetics. Believing in the power
							of preventative treatments, she focuses on accentuating each
							client&apos;s natural beauty.
						</p>
						<p className="text-xl text-gray-700">
							Currently working towards her Doctor of Nursing Practice degree,
							Sarah is committed to staying at the forefront of nursing practice
							and education. In Knoxville and Farragut, she offers personalized
							concierge Botox and dermal filler services, emphasizing patient
							safety, satisfaction, and the celebration of individuality in her
							treatments. Sarah&apos;s practice is grounded in nurturing a
							trusting relationship with each client, ensuring a seamless
							journey to enhanced natural beauty.
						</p>
					</div>
				</div>
			</Card>
		</div>
	)
}
