import { ArrowLeft, FileText, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

export function TermsAndConditionsPage() {
  return (
    <div className="bg-[#FAFAFA] min-h-[82vh] py-8 md:py-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to ZAIKORA KITCHENS</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/refund-policy" className="text-zinc-600 hover:text-zinc-900 hover:underline">
              Refund &amp; Cancellation Policy
            </Link>
            <Link
              to="/login?mode=register"
              className="text-[#D97706] hover:underline"
            >
              Create Customer Account
            </Link>
          </div>
        </div>

        {/* Document Header */}
        <header className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#E88D14] uppercase">
                <FileText className="w-3.5 h-3.5" />
                <span>ZAIKORA KITCHENS · Official Legal Terms</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                TERMS AND CONDITIONS
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

        {/* Terms Sections */}
        <article className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 space-y-8 text-sm text-zinc-700 leading-relaxed">
          <section className="space-y-2.5">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">1. Acceptance of Terms</h2>
            <p>Welcome to ZAIKORA KITCHENS.</p>
            <p>
              These Terms and Conditions govern your access to and use of the ZAIKORA KITCHENS
              website, customer accounts, food ordering services, delivery services and
              self-collection services.
            </p>
            <p>
              By registering an account, accessing our website or placing an order, you agree to
              follow these Terms and Conditions.
            </p>
            <p>Please read them carefully before placing an order.</p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              2. Mandatory Customer Registration
            </h2>
            <p>Customers must create an account before placing an order.</p>
            <p>Guest checkout is not available.</p>
            <p>To register, customers must provide:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Full name</li>
              <li>Mobile number</li>
              <li>Email address</li>
              <li>Four-digit account password</li>
            </ul>
            <p>
              Our current registration system does not require mobile OTP verification or email
              verification.
            </p>
            <p>
              Customers are responsible for providing accurate information and keeping their account
              credentials confidential.
            </p>
            <p>
              Customers must not create accounts using false information or another person&apos;s
              details without permission.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">3. Placing an Order</h2>
            <p>
              Customers can browse the available menu and select their preferred food items through
              the website.
            </p>
            <p>To place an order, customers must:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Create an account and log in.</li>
              <li>Select the available food items.</li>
              <li>Add the selected items to the cart.</li>
              <li>Provide accurate contact and delivery information.</li>
              <li>Select delivery or self-collection.</li>
              <li>Review the order total and applicable charges.</li>
              <li>Complete the online payment.</li>
            </ol>
            <p>An order request is not automatically confirmed when it is submitted.</p>
            <p className="font-semibold text-zinc-900">
              An order is considered confirmed only after successful payment and acceptance by the
              ZAIKORA KITCHENS team.
            </p>
            <p>
              The kitchen reserves the right to review order requests and communicate acceptance or
              rejection to customers.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              4. Online Payment Policy
            </h2>
            <p>Full payment is required before an order can be processed.</p>
            <p>ZAIKORA KITCHENS accepts online payments through Razorpay.</p>
            <p>The following payment rules apply:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Full payment must be completed online.</li>
              <li>Cash on delivery is not available.</li>
              <li>Cash payment at collection is not available.</li>
              <li>Orders without successful payment remain unconfirmed.</li>
              <li>Customers may retry payment if a transaction fails.</li>
            </ul>
            <p>
              If money is deducted but the website does not show successful payment or order
              confirmation, customers should contact customer support for verification.
            </p>
            <p>
              ZAIKORA KITCHENS does not directly collect customers&apos; UPI PINs, card passwords
              or banking credentials. Payment processing is handled through Razorpay.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">5. Order Acceptance</h2>
            <p>All order requests are subject to acceptance by the ZAIKORA KITCHENS team.</p>
            <p>
              The kitchen may review the order, item availability and operational capacity before
              accepting it.
            </p>
            <p>
              Customers should not assume that their order is confirmed until they receive
              acceptance confirmation.
            </p>
            <p>
              If an order cannot be accepted after payment, the customer will be informed and an
              applicable refund will be arranged through the payment system.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              6. Order Cancellation Policy
            </h2>
            <p>
              Once an order has been successfully paid for and accepted by the kitchen, customers
              cannot normally cancel it.
            </p>
            <p>
              This policy helps prevent food wastage, preparation losses and operational expenses.
            </p>
            <p>
              However, customers may contact ZAIKORA KITCHENS in genuine emergency situations and
              request cancellation.
            </p>
            <p>Please note:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Emergency cancellation requests are reviewed individually.</li>
              <li>Cancellation is not automatic.</li>
              <li>
                The kitchen will decide whether the request can be accepted, taking into account the
                preparation and fulfilment status and applicable consumer-protection requirements.
              </li>
              <li>
                If cancellation is approved and a refund is due, it will be processed through
                Razorpay.
              </li>
            </ul>
            <p>
              ZAIKORA KITCHENS aims to initiate approved refunds within{' '}
              <strong className="text-zinc-900">5–7 days</strong>. The time taken for the amount
              to appear in the customer&apos;s account may also depend on Razorpay and the
              customer&apos;s bank or payment provider.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              7. Incorrect, Missing or Damaged Orders
            </h2>
            <p>
              If a customer receives an incorrect, missing or damaged item, they should contact
              ZAIKORA KITCHENS customer support.
            </p>
            <p>
              Customers should provide their order ID and a clear explanation of the issue.
            </p>
            <p>Our team will investigate the complaint.</p>
            <p>Depending on the investigation and circumstances, ZAIKORA KITCHENS may provide:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>A replacement for the affected item; or</li>
              <li>A refund for the affected item or eligible amount.</li>
            </ul>
            <p>The resolution will be communicated to the customer.</p>
          </section>

          <section className="space-y-3 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">8. Delivery Policy</h2>
            <p>
              ZAIKORA KITCHENS provides delivery within Brigade Eldorado and may accept deliveries
              to locations outside Brigade Eldorado, subject to delivery availability.
            </p>

            <div className="space-y-2 pl-3 border-l-2 border-[#E88D14]">
              <h3 className="text-sm font-bold text-zinc-900">
                8.1 Delivery Inside Brigade Eldorado
              </h3>
              <p>For orders within Brigade Eldorado:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Doorstep delivery is available.</li>
                <li>
                  The delivery person will bring the order to the customer&apos;s home door, subject
                  to reasonable access to the property.
                </li>
              </ul>
            </div>

            <div className="space-y-2 pl-3 border-l-2 border-zinc-300">
              <h3 className="text-sm font-bold text-zinc-900">
                8.2 Delivery Outside Brigade Eldorado
              </h3>
              <p>For orders outside Brigade Eldorado:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Delivery is subject to location and availability.</li>
                <li>
                  The order will be handed over at the customer&apos;s apartment or residential
                  property&apos;s main entrance gate.
                </li>
                <li>
                  Doorstep delivery inside the building or apartment is not available.
                </li>
                <li>Customers must collect the order from the designated main gate.</li>
              </ul>
            </div>

            <p>
              Customers must provide accurate delivery details and remain reachable during delivery.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              9. Self-Collection Policy
            </h2>
            <p>Customers may select self-collection when placing an order.</p>
            <p>The following rules apply:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Self-collection has no delivery charge.</li>
              <li>The ₹20 handling charge still applies.</li>
              <li>
                Once the order is ready, ZAIKORA KITCHENS will contact the customer by phone call
                and/or WhatsApp.
              </li>
              <li>The collection address will be communicated directly to the customer.</li>
              <li>The collection address will not be publicly displayed on the website.</li>
              <li>
                Customers should wait for the collection notification before travelling to collect
                their order.
              </li>
            </ul>
            <p>
              Customers must collect their orders from the designated collection location
              communicated by the kitchen.
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              10. Delivery and Handling Charges
            </h2>
            <p>The following charges apply:</p>
            <div className="overflow-x-auto border border-zinc-200 rounded-xl">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Charge</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  <tr>
                    <td className="py-2.5 px-4">Delivery inside Brigade Eldorado</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">₹10</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4">Delivery outside Brigade Eldorado</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">₹10</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4">Self-collection delivery charge</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">₹0</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4">Handling charge per order</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">₹20</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              The ₹20 handling charge applies to every order, including self-collection orders.
            </p>
            <p>Applicable charges will be displayed during checkout before payment.</p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              11. Order Preparation Time
            </h2>
            <p>
              The normal preparation time is approximately{' '}
              <strong className="text-zinc-900">60 minutes after order acceptance</strong>.
            </p>
            <p>Preparation time may vary depending on:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Order size</li>
              <li>Item availability</li>
              <li>Kitchen workload</li>
              <li>Operational circumstances</li>
              <li>Unexpected delays</li>
            </ul>
            <p>
              If an order is ready earlier than expected, ZAIKORA KITCHENS may inform the customer
              through a phone call or WhatsApp message.
            </p>
            <p>The estimated preparation time is not an absolute guarantee.</p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">12. Delayed Orders</h2>
            <p>
              If an order is delayed beyond the expected preparation time, the ZAIKORA KITCHENS
              team will inform the customer through a phone call or WhatsApp message.
            </p>
            <p>Customers are requested to remain reachable and cooperate with the team.</p>
            <p>
              The kitchen will make reasonable efforts to communicate significant delays.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              13. Customer Unavailability During Delivery
            </h2>
            <p>
              Customers must ensure that they are available to receive their orders.
            </p>
            <p>
              If the delivery person reaches the customer&apos;s designated delivery location but
              the customer does not answer calls or collect the order, the following procedure
              applies:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>The delivery person will attempt to contact the customer.</li>
              <li>
                The delivery person will wait for up to{' '}
                <strong className="text-zinc-900">10 minutes</strong>.
              </li>
              <li>
                If the customer does not respond or collect the order within those 10 minutes, the
                delivery will be treated as unsuccessful due to customer unavailability.
              </li>
              <li>
                Under the stated policy, 50% of the amount paid will be deducted and the remaining
                50% will be refunded through Razorpay.
              </li>
            </ol>
            <p>
              This deduction is subject to applicable consumer-protection law and a fair assessment
              of the circumstances and costs incurred. It will not apply where the unsuccessful
              delivery is caused by the kitchen or delivery service rather than customer
              unavailability.
            </p>
            <p>
              Customers should remain available by phone and ensure that their delivery information
              is correct.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              14. Customer Responsibilities
            </h2>
            <p>Customers are responsible for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Providing accurate names and contact information.</li>
              <li>Providing a correct delivery address.</li>
              <li>Maintaining access to their registered mobile number.</li>
              <li>Keeping account passwords confidential.</li>
              <li>Completing payment before expecting order confirmation.</li>
              <li>Checking their order details before submitting payment.</li>
              <li>Being available to receive or collect their orders.</li>
              <li>Treating kitchen staff and delivery personnel respectfully.</li>
              <li>Providing genuine and accurate information when submitting complaints.</li>
            </ul>
            <p>
              Customers must not misuse the website, submit fraudulent orders, attempt unauthorised
              access or interfere with website operations.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              15. Menu, Pricing and Availability
            </h2>
            <p>
              All food items, descriptions, portions and prices are displayed on the website.
            </p>
            <p>Prices and menu availability may change.</p>
            <p>
              Some items may become temporarily unavailable due to ingredient availability, kitchen
              capacity or operational circumstances.
            </p>
            <p>
              Applicable delivery charges, handling charges and other disclosed charges will be
              shown before payment.
            </p>
            <p>
              If a displayed price or menu listing contains an obvious error, ZAIKORA KITCHENS will
              review the issue and communicate with the affected customer.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              16. Loyalty Programme
            </h2>
            <p>
              ZAIKORA KITCHENS may offer loyalty points and special promotional benefits to
              customers.
            </p>
            <p>The following rules apply:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Customer name, mobile number and loyalty points are maintained in a physical
                register.
              </li>
              <li>
                Loyalty records are used to identify customers and check or award points.
              </li>
              <li>Loyalty points expire after one year.</li>
              <li>
                Loyalty benefits may be subject to additional conditions communicated by ZAIKORA
                KITCHENS.
              </li>
              <li>
                Customers must provide accurate information to receive eligible benefits.
              </li>
            </ul>
            <p>
              Loyalty points have no cash value unless expressly stated by ZAIKORA KITCHENS.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              17. Promotional Offers and Marketing
            </h2>
            <p>
              ZAIKORA KITCHENS may provide promotional offers, discounts and restaurant
              advertisements.
            </p>
            <p>
              Customers may choose to receive promotional communications through WhatsApp, phone
              calls and email by selecting the optional marketing consent checkbox during
              registration.
            </p>
            <p>
              Agreeing to promotional communications is not mandatory for account registration or
              ordering.
            </p>
            <p>Customers may withdraw their marketing consent by contacting:</p>
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs space-y-1">
              <p>
                <strong>Email:</strong> contact.zaikoraventures@gmail.com
              </p>
              <p>
                <strong>Phone:</strong> 8970007665
              </p>
            </div>
            <p>
              Promotional offers may have individual eligibility conditions, validity periods and
              usage restrictions.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              18. Website Availability and Maintenance
            </h2>
            <p>
              ZAIKORA KITCHENS makes reasonable efforts to keep its website available and
              operational.
            </p>
            <p>However, temporary interruptions may occur because of:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Website maintenance</li>
              <li>Technical issues</li>
              <li>Internet connectivity problems</li>
              <li>Payment-provider interruptions</li>
              <li>Hosting or database service interruptions</li>
              <li>Other circumstances outside the kitchen&apos;s reasonable control</li>
            </ul>
            <p>ZAIKORA KITCHENS will make reasonable efforts to restore affected services.</p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              19. Website Security and Unauthorised Access
            </h2>
            <p>Customers must not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Attempt to hack or damage the website.</li>
              <li>Attempt to access the admin dashboard without permission.</li>
              <li>Attempt to guess or crack administrator passwords.</li>
              <li>Interfere with website databases or payment systems.</li>
              <li>Upload malicious files or code.</li>
              <li>Access another customer&apos;s private account or order information.</li>
              <li>Conduct activities intended to disrupt website operations.</li>
            </ul>
            <p>
              Suspicious or unauthorised activity may be recorded and investigated. Where
              appropriate, relevant evidence may be reported to the appropriate authorities.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              20. Privacy and Personal Information
            </h2>
            <p>
              Customer information is handled according to the ZAIKORA KITCHENS Privacy Policy.
            </p>
            <p>Customers should read the Privacy Policy to understand:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>What personal information is collected.</li>
              <li>How customer information is used.</li>
              <li>How payment processing works.</li>
              <li>How cookies are used.</li>
              <li>How customer information is retained.</li>
              <li>How to request correction or deletion of eligible personal information.</li>
              <li>How to contact ZAIKORA KITCHENS about privacy matters.</li>
            </ul>
            <p>
              The Privacy Policy forms an important part of the website&apos;s customer terms.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              21. Events Outside Our Reasonable Control
            </h2>
            <p>
              ZAIKORA KITCHENS will not be responsible for delays or interruptions caused by
              circumstances outside its reasonable control, such as severe weather, emergencies,
              public restrictions, major technical failures or unexpected disruptions.
            </p>
            <p>
              Where such circumstances affect an order, the kitchen will make reasonable efforts to
              inform the customer and determine an appropriate solution.
            </p>
            <p>
              Nothing in this section removes any customer rights provided by applicable law.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              22. Limitation of Liability
            </h2>
            <p>
              ZAIKORA KITCHENS will make reasonable efforts to provide accurate menu information,
              reliable ordering services and proper order fulfilment.
            </p>
            <p>
              Nothing in these Terms and Conditions excludes or limits liability where such
              exclusion or limitation is not permitted by applicable law.
            </p>
            <p>
              Customers retain their rights under applicable consumer-protection and other relevant
              laws.
            </p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              23. Changes to These Terms and Conditions
            </h2>
            <p>
              ZAIKORA KITCHENS may update these Terms and Conditions when business operations,
              website features, ordering procedures or applicable legal requirements change.
            </p>
            <p>
              Updated terms will be published on the official website with the revised effective
              date.
            </p>
            <p>Customers are encouraged to review this page periodically.</p>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">
              24. Contact Information
            </h2>
            <p>
              For questions, complaints, order-related issues or clarification about these Terms and
              Conditions, customers may contact:
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
                <strong>Email:</strong> contact.zaikoraventures@gmail.com
              </p>
              <p>
                <strong>Phone:</strong> 8970007665
              </p>
              <p>
                <strong>Business Location:</strong> Brigade Eldorado, Bengaluru, Karnataka, India
              </p>
            </div>
          </section>

          <section className="space-y-2.5 pt-6 border-t border-zinc-100">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">25. Governing Law</h2>
            <p>
              These Terms and Conditions are governed by the applicable laws of India.
            </p>
            <p>
              Any disputes will be handled in accordance with applicable Indian law and the
              jurisdiction of the competent courts.
            </p>
          </section>

          <section className="space-y-3 pt-6 border-t border-zinc-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#D97706]" />
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">26. Final Agreement</h2>
            </div>
            <p>
              By creating an account and placing an order through the ZAIKORA KITCHENS website,
              customers acknowledge that they have read and understood these Terms and Conditions.
            </p>
            <p className="font-semibold text-zinc-900">
              Thank you for choosing ZAIKORA KITCHENS.
            </p>
            <p>We appreciate your trust and look forward to serving you.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
