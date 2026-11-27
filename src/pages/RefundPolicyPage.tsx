import { ArrowLeft, FileText, Mail, MapPin, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

export function RefundPolicyPage() {
  return (
    <div className="bg-[#FAFAFA] min-h-[82vh] py-8 md:py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to ZAIKORA KITCHENS</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/terms" className="text-zinc-600 hover:text-zinc-900 hover:underline">
              Terms &amp; Conditions
            </Link>
            <Link to="/orders" className="text-[#D97706] hover:underline">
              My Orders &amp; Refunds
            </Link>
          </div>
        </div>

        {/* Document Header */}
        <header className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#E88D14] uppercase">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ZAIKORA KITCHENS · Official Policy</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                REFUND AND CANCELLATION POLICY
              </h1>
              <p className="text-xs text-zinc-400">
                Effective Date: The date of publication on the official ZAIKORA KITCHENS website
              </p>
            </div>
            <BrandLogo className="h-14 w-auto shrink-0 self-start sm:self-center" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-zinc-800 text-xs text-zinc-300">
            <div className="space-y-1">
              <p>
                <span className="text-zinc-400">Business Name:</span>{' '}
                <strong className="text-white">ZAIKORA KITCHENS</strong>
              </p>
              <p>
                <span className="text-zinc-400">Ownership:</span>{' '}
                <strong className="text-white">Individual / Proprietorship</strong>
              </p>
              <p>
                <span className="text-zinc-400">Proprietor:</span>{' '}
                <strong className="text-white">ATEEQ ULLA SHARIFF</strong>
              </p>
              <p>
                <span className="text-zinc-400">Customer &amp; Data Management Contact:</span>{' '}
                <strong className="text-white">MOHAMMED AATIF SHARIFF</strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-[#E88D14] shrink-0 mt-0.5" />
                <span>Brigade Eldorado, Bengaluru, Karnataka, India</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#E88D14] shrink-0" />
                <a
                  href="mailto:contact.zaikoraventures@gmail.com"
                  className="hover:text-[#E88D14] break-all"
                >
                  contact.zaikoraventures@gmail.com
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#E88D14] shrink-0" />
                <a href="tel:8970007665" className="font-mono hover:text-[#E88D14]">
                  8970007665
                </a>
              </p>
            </div>
          </div>
        </header>

        {/* Policy Sections 1–24 */}
        <article className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 space-y-8 text-sm text-zinc-700 leading-relaxed">
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              1. Purpose of This Policy
            </h2>
            <p>
              This Refund and Cancellation Policy explains the rules, procedures, deductions,
              timelines, and customer rights regarding order cancellations, rejected orders, delivery
              issues, missing or incorrect items, spoiled food complaints, and payment refunds at
              ZAIKORA KITCHENS.
            </p>
            <p>
              Our goal is to be completely fair and transparent. Freshly prepared food involves
              dedicated ingredients, kitchen preparation time, packaging, and delivery coordination,
              while customers always deserve honest communication and full accountability when
              mistakes happen on our side.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              2. Payment Method &amp; Online-Only Rule
            </h2>
            <p>
              All orders placed through the official ZAIKORA KITCHENS website require 100% online
              payment through Razorpay (UPI, debit/credit cards, netbanking, or supported wallets).
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cash on Delivery (COD) is not available.</li>
              <li>Cash payment at self-collection is not available.</li>
              <li>
                Every refund issued by ZAIKORA KITCHENS is processed strictly back to the
                customer&apos;s original payment method via Razorpay — cash or third-party account
                payouts are not issued.
              </li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              3. Order Submission &amp; Kitchen Acceptance Gate
            </h2>
            <p>
              Completing online payment submits an order request with status{' '}
              <strong className="text-zinc-900">PENDING ADMIN APPROVAL</strong>. An order is never
              automatically confirmed just because payment was completed.
            </p>
            <p>
              Our kitchen team reviews every paid order request for ingredient availability, kitchen
              capacity, and verification before marking it <strong className="text-zinc-900">CONFIRMED</strong>.
              If our kitchen cannot accept your order, Section 6 applies and you receive a full 100%
              refund.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              4. Customer Cancellation Before Preparation Begins
            </h2>
            <p>
              If a customer requests cancellation in a genuine situation after order confirmation but{' '}
              <strong className="text-zinc-900">before kitchen preparation has begun</strong>:
            </p>
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1 text-xs sm:text-sm">
              <p>
                <strong>Cancellation Fee:</strong> 10% of the total order amount (covers payment
                gateway and administrative processing charges).
              </p>
              <p>
                <strong>Refund Issued:</strong> 90% of the total paid amount, refunded through
                Razorpay.
              </p>
            </div>
            <p>
              Customers must call <strong className="text-zinc-900">8970007665</strong> or message us
              on WhatsApp immediately to request pre-preparation cancellation before the kitchen marks
              the order as <strong className="text-zinc-900">PREPARING</strong>.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              5. Customer Cancellation After Preparation Has Begun
            </h2>
            <p>
              Once an order enters the <strong className="text-zinc-900">PREPARING</strong> stage,
              fresh ingredients and kitchen labour have already been committed and cannot be reused.
            </p>
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 text-xs sm:text-sm">
              <p>
                <strong>Cancellation Fee:</strong> 45% of the total order amount (covers preparation,
                ingredients, packaging, and processing costs).
              </p>
              <p>
                <strong>Refund Issued:</strong> 55% of the total paid amount, refunded through
                Razorpay.
              </p>
            </div>
            <p>
              Once food has been dispatched (<strong className="text-zinc-900">OUT FOR DELIVERY</strong>{' '}
              or <strong className="text-zinc-900">READY FOR COLLECTION</strong>), voluntary
              cancellation is normally not eligible unless specifically reviewed by the kitchen under
              extraordinary circumstances.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              6. Orders Rejected or Cancelled by ZAIKORA KITCHENS
            </h2>
            <p>
              If ZAIKORA KITCHENS rejects an order during admin review or cancels a confirmed order
              due to ingredient unavailability, kitchen constraints, or operational issues:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-zinc-900">100% Full Refund:</strong> No cancellation fee or
                gateway deduction is charged to the customer.
              </li>
              <li>
                The full paid amount (including food total, delivery charge, and ₹20 handling charge)
                is refunded via Razorpay to the original payment method.
              </li>
              <li>
                The customer is notified with the rejection reason and Razorpay Refund Reference ID on
                the website and in their customer notifications.
              </li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              7. Self-Collection Orders &amp; Unclaimed Pickups
            </h2>
            <p>
              For self-collection orders at Brigade Eldorado Main Gate:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Self-collection carries ₹0 delivery fee and the standard ₹20 handling charge.</li>
              <li>
                Once the order status becomes <strong className="text-zinc-900">READY FOR COLLECTION</strong>,
                our kitchen contacts you via call/WhatsApp for pickup.
              </li>
              <li>
                Pre-prep (10% deduction / 90% refund) and post-prep (45% deduction / 55% refund) rules
                apply if cancelled before pickup. Unclaimed food prepared fresh to order cannot be
                fully refunded after preparation.
              </li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              8. Customer Unavailability During Delivery (10-Minute Wait Policy)
            </h2>
            <p>
              When the delivery person reaches the customer&apos;s designated Brigade Eldorado
              doorstep or outside-apartment main gate:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>The delivery person will attempt to contact the customer by phone.</li>
              <li>
                The delivery person will wait at the location for up to{' '}
                <strong className="text-zinc-900">10 minutes</strong>.
              </li>
              <li>
                If the customer remains unreachable or does not collect the order within those 10
                minutes, delivery is marked unsuccessful due to customer unavailability.
              </li>
              <li>
                <strong className="text-zinc-900">50% Deduction / 50% Refund:</strong> 50% of the paid
                amount is retained for food and delivery costs incurred, and the remaining 50% is
                refunded via Razorpay.
              </li>
            </ol>
            <p>
              This deduction never applies if the failed delivery was caused by ZAIKORA KITCHENS or
              our delivery personnel.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              9. Delivery Outside Brigade Eldorado (Main Gate Rule)
            </h2>
            <p>
              For addresses outside Brigade Eldorado, delivery is strictly up to the customer&apos;s
              apartment or residential complex main entrance gate. Delivery staff do not enter inside
              external apartment blocks. Refunds cannot be claimed for refusal to collect an order at
              the main entrance gate when this policy was disclosed at checkout.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              10. Missing Items in an Order
            </h2>
            <p>
              If any paid item is missing from your delivered or collected order, contact us
              immediately on <strong className="text-zinc-900">8970007665</strong> or email{' '}
              <strong className="text-zinc-900">contact.zaikoraventures@gmail.com</strong> with your
              Order ID.
            </p>
            <p>
              After verification, ZAIKORA KITCHENS will provide either a prompt redelivery of the
              missing item or a <strong className="text-zinc-900">100% refund for the missing item</strong>.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              11. Incorrect or Wrong Food Items Delivered
            </h2>
            <p>
              If you receive an incorrect dish that does not match your order invoice, share your Order
              ID and clear photo evidence within 2 hours of delivery/collection. Following
              verification, we will arrange a fresh replacement or issue an eligible refund for the
              incorrect item(s).
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              12. Spoiled, Contaminated, or Severely Damaged Food
            </h2>
            <p>
              Food safety and quality are paramount at ZAIKORA KITCHENS. If food arrives spoiled,
              contaminated, leaking due to severe packaging failure, or unfit for consumption, please
              report it within 2 hours with clear photo evidence and your Order ID. Upon
              verification, a full refund for affected item(s) (or full order, where applicable) or a
              fresh replacement will be provided.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              13. Bento Cakes, Cake Sicles &amp; Party Cake Enquires
            </h2>
            <p>
              Bento Cakes (1-hour notice) and Cake Sicles ordered online follow our pre-preparation
              (90% refund) and post-preparation (55% refund) rules unless the cake was rejected by the
              kitchen (100% refund) or arrived damaged/incorrect. Customizable Party Cakes arranged
              via WhatsApp follow the weight/design confirmation terms agreed prior to preparation.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              14. Delayed Orders &amp; 10% Compensation Coupon
            </h2>
            <p>
              Standard preparation time is approximately <strong className="text-zinc-900">60 minutes after kitchen acceptance</strong>.
              If an accepted order experiences a verified significant kitchen/delivery delay caused by
              ZAIKORA KITCHENS without prior customer agreement, the customer may request support
              review and will be eligible for a{' '}
              <strong className="text-zinc-900">10% goodwill discount coupon</strong> for their next
              order (in addition to active resolution of the current order).
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              15. Failed Payments &amp; Double Debits
            </h2>
            <p>
              If a Razorpay transaction fails (`PAYMENT FAILED`), your order is never submitted to the
              kitchen. If your bank account was debited during a failed or interrupted attempt:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Uncaptured Razorpay/UPI debits typically reverse automatically within 5–7 business
                days through your bank.
              </li>
              <li>
                In the event of a verified duplicate payment for the same order, the extra captured
                amount is refunded 100% via Razorpay after transaction reconciliation.
              </li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              16. Delivery Charge &amp; ₹20 Handling Charge Treatment
            </h2>
            <p>
              For full kitchen rejections/cancellations (100% refund), both the ₹10 delivery charge (if
              applicable) and the ₹20 handling charge are refunded in full. For partial item
              refunds, refunds are calculated proportionally for the affected item(s). For voluntary
              customer cancellations, percentages (10% pre-prep / 45% post-prep) apply on the total
              amount paid.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              17. Refund Timeline (5–7 Business Days)
            </h2>
            <p>
              Approved refunds are initiated promptly through Razorpay. Once initiated, funds normally
              reflect in the customer&apos;s bank account, UPI handle, or card statement within{' '}
              <strong className="text-zinc-900">5–7 business days</strong>, depending on Razorpay and
              the customer&apos;s issuing bank processing schedules.
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              18. Official Refund Status Tracking Stages
            </h2>
            <p>
              Customers can track every refund stage transparently on their Order Tracking &amp;
              Order History pages using these six official statuses:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {[
                ['1. Refund Requested', 'Customer submitted a refund or cancellation request for review.'],
                ['2. Under Investigation', 'Kitchen team is verifying order logs, timestamps, or evidence.'],
                ['3. Refund Approved', 'Refund amount and eligibility have been approved for payout.'],
                ['4. Refund Processing', 'Refund has been submitted to Razorpay and is settling with the bank.'],
                ['5. Refund Completed', 'Razorpay has confirmed refund completion to the customer account.'],
                ['6. Refund Rejected', 'Request did not meet policy criteria or Razorpay payout could not complete (with reason).'],
              ].map(([title, desc]) => (
                <div key={title} className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <p className="font-bold text-zinc-900">{title}</p>
                  <p className="text-zinc-600 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              19. Evidence Requirements for Quality or Delivery Claims
            </h2>
            <p>
              To protect genuine customers and prevent fraudulent claims, quality/wrong-item/spill
              complaints require:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Exact ZAIKORA KITCHENS Order ID</li>
              <li>Registered customer mobile number</li>
              <li>Clear photo or short video showing the issue within 2 hours of receipt</li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              20. Non-Refundable Situations
            </h2>
            <p>Refunds are not applicable in the following situations:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Personal taste preference where food was prepared correctly and delivered fresh.</li>
              <li>Incorrect delivery address or unreachable phone number entered by the customer.</li>
              <li>Refusal to collect an outside-Brigade-Eldorado order at the apartment main gate.</li>
              <li>Complaints raised more than 24 hours after consumption without timely reporting/evidence.</li>
            </ul>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              21. Fraudulent Refund Claims &amp; Chargeback Abuse
            </h2>
            <p>
              Repeated false refund claims, fabricated photo evidence, manipulated payment proofs, or
              abusive chargebacks after valid order delivery may result in suspension of ordering
              privileges and submission of server/delivery evidence to Razorpay and relevant
              authorities.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              22. Consumer Protection &amp; Statutory Rights
            </h2>
            <p>
              Nothing in this Refund and Cancellation Policy limits or waives any statutory rights
              available to customers under the Consumer Protection Act and applicable laws of India.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              23. Policy Updates
            </h2>
            <p>
              ZAIKORA KITCHENS may update this Refund and Cancellation Policy periodically to reflect
              operational or regulatory changes. The updated policy becomes effective upon publication
              on the official ZAIKORA KITCHENS website.
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-zinc-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#D97706]" />
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                24. Refund &amp; Cancellation Support Contact
              </h2>
            </div>
            <p>
              To request a cancellation, report an issue, or check a refund reference, please contact:
            </p>
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1 text-xs sm:text-sm">
              <p className="font-bold text-zinc-900">ZAIKORA KITCHENS</p>
              <p>
                <strong>Proprietor:</strong> ATEEQ ULLA SHARIFF
              </p>
              <p>
                <strong>Customer and Data Management Contact:</strong> MOHAMMED AATIF SHARIFF
              </p>
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:contact.zaikoraventures@gmail.com"
                  className="text-[#D97706] hover:underline"
                >
                  contact.zaikoraventures@gmail.com
                </a>
              </p>
              <p>
                <strong>Customer Support Phone / WhatsApp:</strong>{' '}
                <a href="tel:8970007665" className="font-mono text-[#D97706] hover:underline">
                  8970007665
                </a>
              </p>
              <p>
                <strong>Business Location:</strong> Brigade Eldorado, Bengaluru, Karnataka, India
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-semibold">
              <Link to="/terms" className="inline-flex items-center gap-1.5 text-zinc-700 hover:text-[#D97706]">
                <FileText className="w-3.5 h-3.5" />
                <span>Read Terms and Conditions</span>
              </Link>
              <Link to="/track" className="inline-flex items-center gap-1.5 text-[#D97706] hover:underline">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Track an Order or Refund</span>
              </Link>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
