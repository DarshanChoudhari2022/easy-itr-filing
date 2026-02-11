import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Star, ArrowRight, Sparkles, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
    Plan,
    Feature,
    getFeatureDisplayName,
    getRequiredPlan,
    PLAN_INFO
} from '../lib/plan-guard';

interface UpgradePromptProps {
    feature: Feature;
    currentPlan?: Plan;
    title?: string;
    description?: string;
    className?: string;
    variant?: 'card' | 'inline' | 'modal';
}

const UpgradePrompt: React.FC<UpgradePromptProps> = ({
    feature,
    currentPlan = 'free',
    title,
    description,
    className = '',
    variant = 'card',
}) => {
    const navigate = useNavigate();
    const requiredPlan = getRequiredPlan(feature);
    const featureName = getFeatureDisplayName(feature);
    const planInfo = PLAN_INFO[requiredPlan];

    const displayTitle = title || `${featureName} requires ${planInfo.name} plan`;
    const displayDescription = description ||
        `Upgrade to ${planInfo.name} (${planInfo.price}${planInfo.period}) to unlock ${featureName} and more powerful features.`;

    const benefitsByPlan: Record<Plan, string[]> = {
        free: [],
        pro: [
            'All ITR forms (ITR-1, 2, 3, 4)',
            'Crypto Tax Engine with Schedule VDA',
            'Full AIS/TIS Reconciliation',
            'Unlimited AI Tax Assistant',
            'Priority Support',
        ],
        expert: [
            'Everything in Pro plan',
            'Dedicated CA reviews your return',
            '30-minute tax planning call',
            'Section-by-section expert review',
            'Filed within 48 hours',
        ],
    };

    const benefits = benefitsByPlan[requiredPlan] || benefitsByPlan.pro;

    const handleUpgrade = () => {
        navigate('/settings?tab=plan');
    };

    if (variant === 'inline') {
        return (
            <div className={`flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg ${className}`}>
                <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm text-amber-800">
                    {featureName} requires{' '}
                    <button
                        onClick={handleUpgrade}
                        className="font-semibold text-indigo-600 hover:text-indigo-800 underline"
                    >
                        {planInfo.name} plan
                    </button>
                </span>
            </div>
        );
    }

    return (
        <Card className={`border-2 border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 ${className}`}>
            <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Lock className="h-7 w-7 text-indigo-600" />
                </div>
                <CardTitle className="text-xl text-gray-900">
                    {displayTitle}
                </CardTitle>
                <CardDescription className="text-gray-600 max-w-md mx-auto">
                    {displayDescription}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Current Plan Badge */}
                <div className="flex items-center justify-center gap-2">
                    <Badge variant="outline" className="text-gray-500">
                        Current: {PLAN_INFO[currentPlan].name}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <Badge className="bg-indigo-600 text-white">
                        <Star className="h-3 w-3 mr-1 fill-white" />
                        {planInfo.name} {planInfo.price}{planInfo.period}
                    </Badge>
                </div>

                {/* Benefits */}
                <div className="bg-white rounded-lg p-4 border border-gray-100">
                    <p className="text-sm font-medium text-gray-700 mb-3">
                        What you'll unlock with {planInfo.name}:
                    </p>
                    <ul className="space-y-2">
                        {benefits.map((benefit, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                                {i === 0 ? <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" /> :
                                    i === 1 ? <Sparkles className="h-4 w-4 text-indigo-500 flex-shrink-0" /> :
                                        <Shield className="h-4 w-4 text-green-500 flex-shrink-0" />}
                                {benefit}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                        onClick={handleUpgrade}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8"
                        size="lg"
                    >
                        <Star className="h-4 w-4 mr-2 fill-white" />
                        Upgrade to {planInfo.name}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => window.history.back()}
                        size="lg"
                    >
                        Go Back
                    </Button>
                </div>

                {/* Trust note */}
                <p className="text-xs text-center text-gray-400">
                    30-day money-back guarantee • Cancel anytime • Secure payment
                </p>
            </CardContent>
        </Card>
    );
};

export default UpgradePrompt;
