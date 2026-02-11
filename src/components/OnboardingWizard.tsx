import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Calendar, MapPin, Phone, Shield, ChevronRight,
    ChevronLeft, Check, FileText, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '../hooks/use-toast';
import { updateProfileKYC } from '../lib/supabase-data-service';
import {
    isValidPAN, isValidMobile, isValidPincode, isValidDOB,
    INDIAN_STATES, maskPAN
} from '../lib/validators';

interface OnboardingData {
    pan_number: string;
    full_name: string;
    date_of_birth: string;
    gender: string;
    father_name: string;
    mobile: string;
    flat_no: string;
    building: string;
    street: string;
    city: string;
    state: string;
    pincode: string;
    resident_status: string;
}

const STEPS = [
    { id: 'identity', title: 'Identity', icon: Shield, description: 'PAN & Name verification' },
    { id: 'personal', title: 'Personal', icon: User, description: 'Date of birth & gender' },
    { id: 'address', title: 'Address', icon: MapPin, description: 'Residential address' },
    { id: 'contact', title: 'Contact', icon: Phone, description: 'Mobile number' },
    { id: 'confirm', title: 'Confirm', icon: Check, description: 'Review & confirm' },
];

export default function OnboardingWizard() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [data, setData] = useState<OnboardingData>({
        pan_number: '',
        full_name: '',
        date_of_birth: '',
        gender: '',
        father_name: '',
        mobile: '',
        flat_no: '',
        building: '',
        street: '',
        city: '',
        state: '',
        pincode: '',
        resident_status: 'RES',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const updateField = (field: keyof OnboardingData, value: string) => {
        setData(prev => ({ ...prev, [field]: value }));
        // Clear error when user types
        if (errors[field]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    };

    const validateStep = (step: number): boolean => {
        const newErrors: Record<string, string> = {};

        switch (step) {
            case 0: // Identity
                if (!data.pan_number || !isValidPAN(data.pan_number.toUpperCase())) {
                    newErrors.pan_number = 'Enter a valid PAN (e.g., ABCPD1234E)';
                }
                if (!data.full_name || data.full_name.trim().length < 2) {
                    newErrors.full_name = 'Full name is required (as on PAN card)';
                }
                break;
            case 1: // Personal
                if (!data.date_of_birth || !isValidDOB(data.date_of_birth)) {
                    newErrors.date_of_birth = 'Valid date of birth required (must be 18+)';
                }
                if (!data.gender) {
                    newErrors.gender = 'Gender is required for ITR filing';
                }
                if (!data.father_name || data.father_name.trim().length < 2) {
                    newErrors.father_name = "Father's name is required for ITR";
                }
                break;
            case 2: // Address
                if (!data.city) newErrors.city = 'City is required';
                if (!data.state) newErrors.state = 'State is required';
                if (data.pincode && !isValidPincode(data.pincode)) {
                    newErrors.pincode = 'Enter a valid 6-digit pincode';
                }
                break;
            case 3: // Contact
                if (data.mobile && !isValidMobile(data.mobile)) {
                    newErrors.mobile = 'Enter a valid 10-digit mobile number';
                }
                break;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const goNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
        }
    };

    const goBack = () => {
        setCurrentStep(prev => Math.max(prev - 1, 0));
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await updateProfileKYC({
                ...data,
                pan_number: data.pan_number.toUpperCase(),
                onboarding_completed: true,
            });
            toast({
                title: '✅ Profile Complete!',
                description: 'Your KYC details have been saved. You can now start filing.',
            });
            navigate('/dashboard');
        } catch (error: any) {
            toast({
                title: 'Error saving profile',
                description: error.message || 'Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <div className="space-y-5">
                        <div>
                            <Label htmlFor="pan_number" className="text-sm font-medium text-gray-700">
                                PAN Number <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="pan_number"
                                value={data.pan_number}
                                onChange={e => updateField('pan_number', e.target.value.toUpperCase())}
                                placeholder="e.g., ABCPD1234E"
                                maxLength={10}
                                className={`mt-1 uppercase ${errors.pan_number ? 'border-red-400' : ''}`}
                            />
                            {errors.pan_number && <p className="text-xs text-red-500 mt-1">{errors.pan_number}</p>}
                            <p className="text-xs text-gray-400 mt-1">Your 10-character Permanent Account Number</p>
                        </div>
                        <div>
                            <Label htmlFor="full_name" className="text-sm font-medium text-gray-700">
                                Full Name (as on PAN) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="full_name"
                                value={data.full_name}
                                onChange={e => updateField('full_name', e.target.value)}
                                placeholder="Enter your full name"
                                className={`mt-1 ${errors.full_name ? 'border-red-400' : ''}`}
                            />
                            {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
                            <p className="text-xs text-gray-400 mt-1">Must exactly match your PAN card</p>
                        </div>
                    </div>
                );
            case 1:
                return (
                    <div className="space-y-5">
                        <div>
                            <Label htmlFor="date_of_birth" className="text-sm font-medium text-gray-700">
                                Date of Birth <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="date_of_birth"
                                type="date"
                                value={data.date_of_birth}
                                onChange={e => updateField('date_of_birth', e.target.value)}
                                className={`mt-1 ${errors.date_of_birth ? 'border-red-400' : ''}`}
                            />
                            {errors.date_of_birth && <p className="text-xs text-red-500 mt-1">{errors.date_of_birth}</p>}
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-700">
                                Gender <span className="text-red-500">*</span>
                            </Label>
                            <Select value={data.gender} onValueChange={v => updateField('gender', v)}>
                                <SelectTrigger className={`mt-1 ${errors.gender ? 'border-red-400' : ''}`}>
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="M">Male</SelectItem>
                                    <SelectItem value="F">Female</SelectItem>
                                    <SelectItem value="O">Other</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.gender && <p className="text-xs text-red-500 mt-1">{errors.gender}</p>}
                        </div>
                        <div>
                            <Label htmlFor="father_name" className="text-sm font-medium text-gray-700">
                                Father's Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="father_name"
                                value={data.father_name}
                                onChange={e => updateField('father_name', e.target.value)}
                                placeholder="Enter father's full name"
                                className={`mt-1 ${errors.father_name ? 'border-red-400' : ''}`}
                            />
                            {errors.father_name && <p className="text-xs text-red-500 mt-1">{errors.father_name}</p>}
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-700">Resident Status</Label>
                            <Select value={data.resident_status} onValueChange={v => updateField('resident_status', v)}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="RES">Resident</SelectItem>
                                    <SelectItem value="NRI">Non-Resident (NRI)</SelectItem>
                                    <SelectItem value="RNOR">Resident but Not Ordinarily Resident</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="flat_no" className="text-sm font-medium text-gray-700">Flat/Door No</Label>
                                <Input id="flat_no" value={data.flat_no} onChange={e => updateField('flat_no', e.target.value)}
                                    placeholder="e.g., 402" className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="building" className="text-sm font-medium text-gray-700">Building/Complex</Label>
                                <Input id="building" value={data.building} onChange={e => updateField('building', e.target.value)}
                                    placeholder="e.g., Sunrise Tower" className="mt-1" />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="street" className="text-sm font-medium text-gray-700">Street/Road</Label>
                            <Input id="street" value={data.street} onChange={e => updateField('street', e.target.value)}
                                placeholder="e.g., MG Road" className="mt-1" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="city" className="text-sm font-medium text-gray-700">
                                    City <span className="text-red-500">*</span>
                                </Label>
                                <Input id="city" value={data.city} onChange={e => updateField('city', e.target.value)}
                                    placeholder="e.g., Mumbai" className={`mt-1 ${errors.city ? 'border-red-400' : ''}`} />
                                {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
                            </div>
                            <div>
                                <Label htmlFor="pincode" className="text-sm font-medium text-gray-700">Pincode</Label>
                                <Input id="pincode" value={data.pincode} onChange={e => updateField('pincode', e.target.value)}
                                    placeholder="e.g., 400001" maxLength={6} className={`mt-1 ${errors.pincode ? 'border-red-400' : ''}`} />
                                {errors.pincode && <p className="text-xs text-red-500 mt-1">{errors.pincode}</p>}
                            </div>
                        </div>
                        <div>
                            <Label className="text-sm font-medium text-gray-700">
                                State/UT <span className="text-red-500">*</span>
                            </Label>
                            <Select value={data.state} onValueChange={v => updateField('state', v)}>
                                <SelectTrigger className={`mt-1 ${errors.state ? 'border-red-400' : ''}`}>
                                    <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                                <SelectContent>
                                    {INDIAN_STATES.map(s => (
                                        <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.state && <p className="text-xs text-red-500 mt-1">{errors.state}</p>}
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="space-y-5">
                        <div>
                            <Label htmlFor="mobile" className="text-sm font-medium text-gray-700">Mobile Number</Label>
                            <div className="flex mt-1">
                                <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-100 border border-r-0 border-gray-200 rounded-l-md">
                                    +91
                                </span>
                                <Input
                                    id="mobile"
                                    value={data.mobile}
                                    onChange={e => updateField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    placeholder="9876543210"
                                    maxLength={10}
                                    className={`rounded-l-none ${errors.mobile ? 'border-red-400' : ''}`}
                                />
                            </div>
                            {errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>}
                            <p className="text-xs text-gray-400 mt-1">Used for OTP verification and filing updates</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                            <p className="text-sm text-blue-800 font-medium mb-2">Why we need your details</p>
                            <ul className="text-xs text-blue-700 space-y-1">
                                <li>• PAN, DOB, and address are mandatory fields in the ITR form</li>
                                <li>• Your mobile number is used for e-verification via Aadhaar OTP</li>
                                <li>• All data is encrypted and never shared with third parties</li>
                            </ul>
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                            <Sparkles className="h-8 w-8 text-green-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-green-800">Almost there! Review your details.</p>
                        </div>
                        <div className="space-y-3">
                            {[
                                { label: 'PAN', value: maskPAN(data.pan_number) },
                                { label: 'Name', value: data.full_name },
                                { label: 'DOB', value: data.date_of_birth },
                                { label: 'Gender', value: data.gender === 'M' ? 'Male' : data.gender === 'F' ? 'Female' : 'Other' },
                                { label: "Father's Name", value: data.father_name },
                                { label: 'City', value: data.city },
                                { label: 'State', value: INDIAN_STATES.find(s => s.code === data.state)?.name || data.state },
                                { label: 'Mobile', value: data.mobile ? `+91 ${data.mobile}` : 'Not provided' },
                            ].map(item => (
                                <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                    <span className="text-sm text-gray-500">{item.label}</span>
                                    <span className="text-sm font-medium text-gray-900">{item.value || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg shadow-xl border-0">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center">
                        <FileText className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-gray-900">Complete Your Profile</CardTitle>
                    <CardDescription>These details are required for your ITR filing</CardDescription>
                </CardHeader>

                {/* Step Indicator */}
                <div className="px-6 pb-4">
                    <div className="flex items-center justify-between">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon;
                            const isActive = index === currentStep;
                            const isCompleted = index < currentStep;
                            return (
                                <React.Fragment key={step.id}>
                                    <div className="flex flex-col items-center">
                                        <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium transition-all ${isCompleted ? 'bg-green-500 text-white' :
                                                isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                                                    'bg-gray-100 text-gray-400'
                                            }`}>
                                            {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                        </div>
                                        <span className={`text-[10px] mt-1 ${isActive ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                                            {step.title}
                                        </span>
                                    </div>
                                    {index < STEPS.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-1 ${index < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                <CardContent className="pt-0">
                    {/* Step Content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="min-h-[280px]"
                        >
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">{STEPS[currentStep].title}</h3>
                                <p className="text-sm text-gray-500">{STEPS[currentStep].description}</p>
                            </div>
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>

                    {/* Navigation */}
                    <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
                        <Button
                            variant="outline"
                            onClick={goBack}
                            disabled={currentStep === 0}
                            className="gap-1"
                        >
                            <ChevronLeft className="h-4 w-4" /> Back
                        </Button>

                        {currentStep < STEPS.length - 1 ? (
                            <Button onClick={goNext} className="bg-indigo-600 hover:bg-indigo-700 gap-1">
                                Next <ChevronRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="bg-green-600 hover:bg-green-700 gap-1"
                            >
                                {isSubmitting ? 'Saving...' : 'Complete Setup'} <Check className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* Skip option */}
                    {currentStep < STEPS.length - 1 && (
                        <p className="text-center text-xs text-gray-400 mt-3">
                            <button onClick={() => navigate('/dashboard')} className="hover:text-indigo-600 underline">
                                Skip for now (you can complete this later in Settings)
                            </button>
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
