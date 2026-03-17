/**
 * EasyITR Landing Page
 * Professional, Clean Design with Premium Typography
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  Zap,
  FileText,
  Users,
  Bitcoin,
  Globe,
  Building2,
  Sparkles,
  Clock,
  Star,
  Menu,
  X,
  Calculator,
  TrendingUp,
  Lock,
  Award,
  BarChart3,
  Target,
  ShieldCheck,
  PieChart,
  ChevronRight,
  Play,
  Wallet,
  Receipt,
  FileCheck,
  Bot,
  Phone,
  Mail,
  MapPin
} from "lucide-react";
import TaxChatbot from "@/components/TaxChatbot";

export default function Index() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* ===== NAVIGATION ===== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5">
              <div className="h-9 w-9 bg-indigo-600 rounded-lg flex items-center justify-center">
                <ShieldCheck className="text-white h-5 w-5" />
              </div>
              <span className="text-xl font-bold text-gray-900">EasyITR</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Features</a>
              <a href="#solutions" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Solutions</a>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Pricing</a>
              <a href="#contact" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Contact</a>
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center gap-3">
              <Link to="/auth">
                <Button variant="ghost" className="text-gray-600 font-medium">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button className="bg-indigo-600 hover:bg-indigo-700 font-medium px-5">
                  Start Free
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2">
              {mobileMenuOpen ? <X className="h-6 w-6 text-gray-900" /> : <Menu className="h-6 w-6 text-gray-900" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
            <a href="#features" className="block text-gray-900 font-medium py-2">Features</a>
            <a href="#solutions" className="block text-gray-900 font-medium py-2">Solutions</a>
            <a href="#pricing" className="block text-gray-900 font-medium py-2">Pricing</a>
            <a href="#contact" className="block text-gray-900 font-medium py-2">Contact</a>
            <div className="pt-4 space-y-2">
              <Link to="/auth" className="block">
                <Button variant="outline" className="w-full">Sign In</Button>
              </Link>
              <Link to="/auth" className="block">
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700">Start Free</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="pt-24 lg:pt-32 pb-16 lg:pb-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Content */}
            <div className="space-y-8 text-center lg:text-left">
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 px-4 py-1.5 text-sm font-medium">
                <Star className="h-3.5 w-3.5 mr-1.5 text-amber-500 fill-amber-500" />
                AY 2026-27 • Budget 2025 Ready
              </Badge>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight tracking-tight">
                File Your ITR
                <span className="block text-indigo-600">With Confidence</span>
              </h1>

              <p className="text-lg text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
                India's most trusted tax filing platform. Budget 2025 slabs with ₹12L zero-tax rebate,
                AI-powered calculations, crypto Schedule VDA, and seamless e-filing for salaried
                professionals, freelancers, and crypto investors.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                <Link to="/auth">
                  <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 h-12 px-8 text-base font-medium shadow-lg shadow-indigo-200">
                    Start Filing Now
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="h-12 px-8 text-base font-medium">
                    <Calculator className="mr-2 h-4 w-4" />
                    Try Tax Calculator
                  </Button>
                </Link>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 pt-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>85,000+ Users</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  <span>Bank-Grade Security</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span>10 Min Filing</span>
                </div>
              </div>
            </div>

            {/* Right: Dashboard Preview */}
            <div className="relative hidden lg:block">
              <div className="bg-white rounded-2xl shadow-2xl shadow-gray-200 border border-gray-100 overflow-hidden">
                {/* Dashboard Header */}
                <div className="bg-gray-900 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-white font-semibold text-sm">Tax Dashboard</span>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">AY 2026-27</Badge>
                  </div>
                </div>

                {/* Dashboard Content */}
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500 font-medium">Gross Income</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">₹12,50,000</p>
                    </div>
                    <div className="p-4 rounded-xl bg-indigo-50">
                      <p className="text-xs text-indigo-600 font-medium">Tax Saved</p>
                      <p className="text-2xl font-bold text-indigo-600 mt-1">₹1,25,000</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 font-medium">Filing Progress</span>
                      <span className="text-indigo-600 font-semibold">85%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: '85%' }} />
                    </div>
                  </div>

                  {/* Action Items */}
                  <div className="space-y-2">
                    {['Salary Details ✓', 'Form 16 Uploaded ✓', 'Deductions Added ✓', 'Bank Details Pending'].map((item, i) => (
                      <div key={i} className={`flex items-center gap-2 p-3 rounded-lg ${i === 3 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                        <CheckCircle2 className={`h-4 w-4 ${i === 3 ? 'text-amber-500' : 'text-emerald-500'}`} />
                        <span className="text-sm font-medium text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg border border-gray-100 p-4 transform rotate-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tax Optimization</p>
                    <p className="text-lg font-bold text-emerald-600">+₹45,000</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== STATS SECTION ===== */}
      {/* <section className="py-16 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-gray-900">₹350Cr+</p>
              <p className="text-sm text-gray-500 font-medium mt-1">Tax Refunds Processed</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-indigo-600">99.9%</p>
              <p className="text-sm text-gray-500 font-medium mt-1">Accuracy Rate</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-gray-900">85,000+</p>
              <p className="text-sm text-gray-500 font-medium mt-1">Happy Taxpayers</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-emerald-600">24/7</p>
              <p className="text-sm text-gray-500 font-medium mt-1">Expert Support</p>
            </div>
          </div>
        </div>
      </section> */}

      {/* ===== FEATURES SECTION ===== */}
      <section id="features" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 mb-4">Features</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need for Tax Filing
            </h2>
            <p className="text-lg text-gray-600">
              From auto-import to e-filing, we've built every feature you need
              to file your ITR accurately and on time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                icon: <FileText className="h-6 w-6" />,
                title: "Auto Form 16 Import",
                desc: "Upload your Form 16 PDF and we automatically extract all salary details, TDS, and employer information.",
                color: "bg-blue-500"
              },
              {
                icon: <Calculator className="h-6 w-6" />,
                title: "Smart Regime Comparison",
                desc: "Our AI compares Old vs New tax regime and recommends the one that saves you more money.",
                color: "bg-indigo-500"
              },
              {
                icon: <Shield className="h-6 w-6" />,
                title: "AIS Reconciliation",
                desc: "Cross-verify your income data with Annual Information Statement to avoid discrepancies.",
                color: "bg-emerald-500"
              },
              {
                icon: <Bitcoin className="h-6 w-6" />,
                title: "Crypto Tax Calculator",
                desc: "Import trades from CoinDCX, WazirX, Binance. Auto-calculate gains and generate Schedule VDA.",
                color: "bg-orange-500"
              },
              {
                icon: <Bot className="h-6 w-6" />,
                title: "AI Tax Assistant",
                desc: "Get instant answers to your tax questions. Our AI understands Indian tax laws deeply.",
                color: "bg-purple-500"
              },
              {
                icon: <FileCheck className="h-6 w-6" />,
                title: "One-Click E-Filing",
                desc: "Generate ITR JSON ready for income tax portal. File ITR-1, 2, 3, 4 with ease.",
                color: "bg-teal-500"
              }
            ].map((feature, i) => (
              <Card key={i} className="border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all">
                <CardContent className="p-6">
                  <div className={`h-12 w-12 ${feature.color} rounded-xl flex items-center justify-center text-white mb-4`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SOLUTIONS SECTION ===== */}
      <section id="solutions" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 mb-4">Solutions</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Built for Every Taxpayer
            </h2>
            <p className="text-lg text-gray-600">
              Whether you're a salaried professional, business owner, or crypto investor,
              we have the right solution for you.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {[
              {
                title: "Salaried Professionals",
                desc: "Easy ITR-1 & ITR-2 filing with Form 16 auto-import, HRA calculator, and regime optimization.",
                icon: <Receipt className="h-8 w-8" />,
                features: ["Form 16 Auto-Import", "HRA & LTA Calculator", "Section 80C/80D Optimizer", "New vs Old Regime Comparison"],
                color: "from-blue-500 to-indigo-600"
              },
              {
                title: "Crypto Investors",
                desc: "Complete VDA tax compliance with exchange sync, FIFO calculation, and Schedule VDA generation.",
                icon: <Bitcoin className="h-8 w-8" />,
                features: ["Multi-Exchange Import", "FIFO Cost Basis", "Schedule VDA Report", "30% Tax + TDS Tracking"],
                color: "from-orange-500 to-amber-600",
                popular: true
              },
              {
                title: "Business & Freelancers",
                desc: "ITR-3 & ITR-4 filing with presumptive taxation, GST reconciliation, and P&L preparation.",
                icon: <Building2 className="h-8 w-8" />,
                features: ["44AD/44ADA Support", "GST + ITR Sync", "Capital Gains Handling", "Balance Sheet Prep"],
                color: "from-emerald-500 to-teal-600"
              }
            ].map((solution, i) => (
              <div
                key={i}
                className={`relative bg-white rounded-2xl p-8 border ${solution.popular ? 'border-indigo-200 shadow-xl' : 'border-gray-100'}`}
              >
                {solution.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white border-0">
                    Most Popular
                  </Badge>
                )}
                <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${solution.color} flex items-center justify-center text-white mb-6`}>
                  {solution.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{solution.title}</h3>
                <p className="text-gray-600 text-sm mb-6">{solution.desc}</p>
                <ul className="space-y-3 mb-8">
                  {solution.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-gray-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth">
                  <Button className={`w-full ${solution.popular ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-900 hover:bg-gray-800'}`}>
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 mb-4">How It Works</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              File Your ITR in 3 Simple Steps
            </h2>
            <p className="text-lg text-gray-600">
              Our guided wizard makes tax filing as easy as ordering food online.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Import Your Data",
                desc: "Upload Form 16, connect your crypto exchanges, or enter income details manually. Our AI auto-fills most fields."
              },
              {
                step: "02",
                title: "Review & Optimize",
                desc: "Compare tax regimes, add deductions, and verify your income against AIS. We show you exactly where you can save."
              },
              {
                step: "03",
                title: "File & Download",
                desc: "Generate ITR JSON, download for e-filing portal upload, or use CA-assisted filing for complex cases."
              }
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="h-16 w-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link to="/auth">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 h-12 px-8">
                Start Your Filing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== PRICING SECTION ===== */}
      <section id="pricing" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 mb-4">Pricing</Badge>
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600">
              No hidden fees. Pay only for what you need.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Free",
                price: "₹0",
                desc: "For simple ITR-1 filing",
                features: ["ITR-1 (Sahaj) Filing", "Form 16 Import", "Basic Tax Calculator", "Email Support"],
                cta: "Start Free"
              },
              {
                name: "Pro",
                price: "₹499",
                period: "/year",
                desc: "For advanced users",
                features: ["All ITR Forms (1-4)", "Crypto Tax Engine", "AIS Reconciliation", "Regime Optimizer", "Priority Support"],
                popular: true,
                cta: "Get Pro"
              },
              {
                name: "Expert Assisted",
                price: "₹1,999",
                period: "/filing",
                desc: "CA-reviewed filing",
                features: ["Everything in Pro", "Dedicated CA Review", "Audit Support", "Tax Planning Call", "Document Preparation"],
                cta: "Book Expert"
              }
            ].map((plan, i) => (
              <div
                key={i}
                className={`rounded-2xl p-8 ${plan.popular ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : 'bg-white border border-gray-200'}`}
              >
                {plan.popular && (
                  <Badge className="bg-white text-indigo-600 border-0 mb-4">Most Popular</Badge>
                )}
                <h3 className={`text-xl font-semibold ${plan.popular ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                <p className={`text-sm mt-1 ${plan.popular ? 'text-indigo-200' : 'text-gray-500'}`}>{plan.desc}</p>

                <div className="my-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className={`text-sm ${plan.popular ? 'text-indigo-200' : 'text-gray-500'}`}>{plan.period}</span>}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className={`flex items-center gap-3 text-sm ${plan.popular ? 'text-indigo-100' : 'text-gray-600'}`}>
                      <CheckCircle2 className={`h-4 w-4 ${plan.popular ? 'text-indigo-300' : 'text-emerald-500'} shrink-0`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to="/auth">
                  <Button
                    className={`w-full ${plan.popular ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 lg:py-28 bg-indigo-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6">
            Ready to File Your ITR?
          </h2>
          <p className="text-lg text-indigo-100 mb-8 max-w-2xl mx-auto">
            Join taxpayers who trust EasyITR for accurate, hassle-free tax filing.
            Start your filing today and save both time and money.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50 h-12 px-8 font-medium">
                Start Filing Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="h-12 px-8 font-medium border-white/30 text-white bg-white/10 hover:bg-white/20">
                Try Free Calculator
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-indigo-200 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>256-bit SSL</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Bank-Grade Security</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer id="contact" className="bg-gray-900 text-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {/* Brand */}
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <ShieldCheck className="text-white h-5 w-5" />
                </div>
                <span className="text-xl font-bold">EasyITR</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                India's trusted tax filing platform. AI-powered, secure, and designed for everyone.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <div className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer">
                  <span className="text-xs">𝕏</span>
                </div>
                <div className="h-10 w-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-gray-700 cursor-pointer">
                  <span className="text-xs">in</span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">ITR Filing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Crypto Tax</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Tax Calculator</a></li>
                <li><a href="#" className="hover:text-white transition-colors">CA Assistance</a></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Tax Guide 2025</a></li>
                <li><a href="#" className="hover:text-white transition-colors">ITR Deadlines</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>support@easyitr.in</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>+91 98765 43210</span>
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5" />
                  <span>Mumbai, Maharashtra, India</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">© 2026 EasyITR Technologies Pvt. Ltd. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Security</a>
            </div>
          </div>
        </div>
      </footer>

      {/* AI Chatbot */}
      <TaxChatbot />
    </div>
  );
}

