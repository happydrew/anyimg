import React, { useState } from 'react';
import Head from 'next/head';
import { Button, Card, CardBody, CardFooter, CardHeader, Spinner, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@nextui-org/react';
import { useAuth } from '@/contexts/AuthContext';
import { FaCheckCircle, FaCoins, FaStar } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { MdDiamond } from 'react-icons/md';

// Plans data
const plans = [
    {
        id: 'basic',
        name: 'Basic',
        icon: <FaStar className="text-amber-500 w-10 h-10" />,
        price: '$5',
        credits: 100,
        valueProposition: 'Great Value',
        features: [
            '100 AI drawing credits',
            'Enhanced image creation',
            'Standard processing',
            'Unlimited validity period',
        ],
        description: 'Perfect for beginners exploring AI image creation. Get started with AnyImg at an affordable price!',
        recommended: false,
        color: 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20',
        buttonClass: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-md hover:shadow-lg transition-shadow',
    },
    {
        id: 'premium',
        name: 'Premium',
        icon: <MdDiamond className="text-purple-500 w-10 h-10" />,
        price: '$10',
        credits: 200,
        valueProposition: 'Best Value',
        features: [
            '200 AI drawing credits',
            'Enhanced image creation',
            'Priority processing',
            'Unlimited validity period',
            'Premium customer support',
        ],
        description: 'Our most popular plan with excellent value. Create twice as many images at a better per-credit rate!',
        recommended: true,
        color: 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20',
        buttonClass: 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md hover:shadow-lg transition-shadow',
    }
];

export default function PricePage() {
    const router = useRouter();
    const { user, setIsLoginModalOpen, setLoginModalRedirectTo, getAccessToken } = useAuth();
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

    const handlePurchase = async (planId: string) => {
        if (!user) {
            setLoginModalRedirectTo(`${window.location.origin}/pricing`);
            setIsLoginModalOpen(true);
            return;
        }

        setSelectedPlan(planId);
        setIsProcessing(true);
        setErrorMessage(null);

        // Show purchase modal instead of redirecting
        setIsPurchaseModalOpen(true);
        setIsProcessing(false);
        return; // Early return to skip the regular payment flow

        try {
            // Get the selected plan
            const selectedPlan = plans.find(plan => plan.id === planId);
            if (!selectedPlan) {
                throw new Error('Plan does not exist');
            }

            // Get JWT access token
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Authentication failed. Please login again.');
            }

            // Call the create order API with JWT token in Authorization header
            const response = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    planId,
                    amount: selectedPlan.price.replace('$', ''),
                    credits: selectedPlan.credits,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create payment order');
            }

            const { paymentUrl } = await response.json();

            // Redirect to Creem payment page
            window.location.href = paymentUrl;
        } catch (error) {
            console.error('Payment error:', error);
            setErrorMessage(error.message || 'An error occurred while processing your payment request. Please try again later');
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f9ee] py-8">
            <div className="container mx-auto px-4">
                {/* Page title */}
                <div className="text-center mb-8">
                    {/* <div className="inline-block mb-4">
                            <Image
                                src="/totoro.jpg"
                                alt="Totoro"
                                width={160}
                                height={80}
                                className="mx-auto"
                            />
                        </div> */}
                    <h1 className="text-4xl font-bold text-[#1c4c3b] mb-4">Choose Your Plan</h1>
                    <p className="text-xl text-[#506a3a] max-w-2xl mx-auto">
                        Each credit generates one AI image. Select the plan that best fits your creative needs.
                    </p>
                    {/* TEMPORARY: Display development mode notice */}
                    {/* <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-amber-600 max-w-md mx-auto">
                        <p className="text-sm"><strong>Note:</strong> Our payment system is temporarily in development mode. You'll receive free credits to try our service.</p>
                    </div> */}
                    {errorMessage && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 max-w-md mx-auto">
                            {errorMessage}
                        </div>
                    )}
                </div>

                {/* Plan cards */}
                <div className="flex flex-wrap justify-center items-center gap-16 w-full mx-auto">
                    {plans.map((plan) => (
                        <Card
                            key={plan.id}
                            className={`max-w-96 ${plan.color} border ${plan.recommended ? 'border-amber-400 shadow-xls z-10' : 'border-[#89aa7b]/30 shadow-md'} rounded-2xl overflow-visible`}
                            style={{ height: '650px' }}
                        >
                            {plan.recommended && (
                                <div className="absolute -top-4 left-0 right-0 mx-auto w-max px-6 py-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-white rounded-full text-sm font-bold shadow-md">
                                    Most Popular
                                </div>
                            )}
                            <CardHeader className="flex gap-3 flex-col items-center pt-8 pb-2">
                                <div className="bg-white p-4 rounded-full shadow-sm">
                                    {plan.icon}
                                </div>
                                <div className="flex flex-col items-center">
                                    <p className="text-lg font-medium text-[#1c4c3b]">{plan.name}</p>
                                    <div className="flex items-baseline gap-1 mt-1">
                                        <h4 className="text-4xl font-bold text-[#1c4c3b]">{plan.price}</h4>
                                    </div>
                                    <div className="flex items-center gap-1 text-amber-600 mt-1">
                                        <FaCoins className="text-amber-500" />
                                        <span className="font-bold">{plan.credits} credits</span>
                                    </div>
                                    <p className="text-[#506a3a] mt-1 font-medium">{plan.valueProposition}</p>
                                </div>
                            </CardHeader>
                            <CardBody className="px-6 py-4 flex-grow flex flex-col">
                                <p className="text-[#506a3a] text-center mb-6 flex-shrink-0">
                                    {plan.description}
                                </p>
                                <ul className="space-y-3 flex-grow">
                                    {plan.features.map((feature, index) => (
                                        <li key={index} className="flex items-start gap-2">
                                            <FaCheckCircle className="text-[#1c4c3b] mt-1 flex-shrink-0" />
                                            <span className="text-[#506a3a]">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardBody>
                            <CardFooter className="flex justify-center pb-8 pt-4">
                                <Button
                                    className={`w-full ${plan.buttonClass} font-medium rounded-xl py-6 text-base`}
                                    onClick={() => handlePurchase(plan.id)}
                                    disabled={isProcessing && selectedPlan === plan.id}
                                >
                                    {isProcessing && selectedPlan === plan.id ? (
                                        <div className="flex items-center gap-2">
                                            <Spinner size="sm" color="white" />
                                            <span>Processing...</span>
                                        </div>
                                    ) : user ? (
                                        'Purchase Now'
                                    ) : (
                                        'Login to Purchase'
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>

                {/* Additional information */}
                <div className="mt-20 text-center max-w-3xl mx-auto">
                    <h2 className="text-2xl font-bold text-[#1c4c3b] mb-4">Frequently Asked Questions</h2>
                    <div className="bg-white p-8 rounded-2xl shadow-md border border-[#89aa7b]/30 text-left">
                        <div className="space-y-6">
                            <div>
                                <h3 className="font-bold text-[#1c4c3b] mb-2">How long are credits valid?</h3>
                                <p className="text-[#506a3a]">All purchased credits have unlimited validity and never expire. Use them whenever you want!</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-[#1c4c3b] mb-2">What can I create with one credit?</h3>
                                <p className="text-[#506a3a]">Each credit allows you to generate one AI image based on your prompts or input images.</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-[#1c4c3b] mb-2">What payment methods do you accept?</h3>
                                <p className="text-[#506a3a]">We accept credit cards, PayPal, and major digital payment methods. All transactions are securely encrypted.</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-[#1c4c3b] mb-2">Can I get a refund?</h3>
                                <p className="text-[#506a3a]">Yes, unused credits can be refunded proportionally. Please check our <a href="/refund-policy" className="text-blue-600 hover:underline">Refund Policy</a> for details.</p>
                            </div>
                            <div>
                                <h3 className="font-bold text-[#1c4c3b] mb-2">Are there any free credits?</h3>
                                <p className="text-[#506a3a]">New users receive 3 free credits to try our service before purchasing.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Call to action */}
                <div className="mt-16 text-center">
                    <Button
                        className="bg-gradient-to-r from-[#1c4c3b] to-[#2a6854] text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-shadow"
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                        Start Creating
                    </Button>
                </div>
            </div>

            {/* Purchase Information Modal */}
            <Modal
                isOpen={isPurchaseModalOpen}
                onClose={() => setIsPurchaseModalOpen(false)}
                size="lg"
            >
                <ModalContent>
                    <ModalHeader className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold text-[#1c4c3b]">Purchase Information</h3>
                    </ModalHeader>
                    <ModalBody>
                        <div className="p-4 text-[#506a3a]">
                            <p className="mb-4">Thank you for your support of AnyImg!</p>
                            <p className="mb-4">Our payment system is currently under development. Please contact <span className="font-bold">zhugetd@gmail.com</span> to purchase credits.</p>
                            <p className="mb-4">Please include in your email:</p>
                            <ul className="list-disc pl-5 mb-4">
                                <li>The account to be recharged</li>
                                <li>The plan you wish to purchase</li>
                            </ul>
                            <p className="mb-4">We will credit your account within 1 hour after receiving your email.</p>
                            <p className="font-medium">Payment methods we currently support:</p>
                            <ul className="list-disc pl-5">
                                <li>PayPal</li>
                                <li>Alipay</li>
                                <li>WeChat Pay</li>
                            </ul>
                        </div>
                    </ModalBody>
                    <ModalFooter>
                        <Button
                            className="bg-gradient-to-r from-[#1c4c3b] to-[#2a6854] text-white"
                            onClick={() => setIsPurchaseModalOpen(false)}
                        >
                            Got it
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </div>
    );
} 