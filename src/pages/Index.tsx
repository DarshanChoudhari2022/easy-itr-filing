import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
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
  Play,
  ChevronRight,
  Bot,
  Calculator,
  TrendingUp,
  Lock,
  Award,
  BarChart3,
  Briefcase,
  Target,
  Rocket,
  Heart,
  ShieldCheck,
  Search,
  PieChart,
  Activity
} from "lucide-react";
import TaxChatbot from "@/components/TaxChatbot";

interface AnimatedSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

// Scroll-triggered animation component
function AnimatedSection({ children, className = "", delay = 0 }: AnimatedSectionProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.8, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface Card3DProps {
  children: React.ReactNode;
  className?: string;
}

// 3D Card with hover effect
function Card3D({ children, className = "" }: Card3DProps) {
  return (
    <motion.div
      whileHover={{
        rotateX: -5,
        rotateY: 5,
        scale: 1.02,
        boxShadow: "0 25px 50px -12px rgba(79, 70, 229, 0.25)"
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`transform-gpu perspective-1000 ${className}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}

interface Float3DProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}

// Floating 3D element
function Float3D({ children, delay = 0, duration = 3 }: Float3DProps) {
  return (
    <motion.div
      animate={{
        y: [-10, 10, -10],
        rotateZ: [-1, 1, -1]
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      {children}
    </motion.div>
  );
}

export default function Index() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  return (
    <div className="min-h-screen bg-white font-sans antialiased overflow-x-hidden">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-teal-400 to-indigo-600 z-[100] origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* ===== NAVIGATION ===== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <ShieldCheck className="text-white h-6 w-6" />
              </div>
              <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-slate-900 to-indigo-600 bg-clip-text text-transparent">
                TaxMitra
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-10">
              <a href="#solutions" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Solutions</a>
              <a href="#features" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Features</a>
              <a href="#pricing" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Pricing</a>
              <a href="#expert" className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors">Hire Expert</a>
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" className="font-bold text-slate-600">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button className="bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-200 font-bold rounded-full px-8 h-11">
                  Start Free Filing
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-900">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="md:hidden bg-white border-t border-slate-100 px-6 py-6 space-y-4 shadow-2xl"
          >
            <a href="#solutions" className="block text-slate-900 font-bold py-2">Solutions</a>
            <a href="#features" className="block text-slate-900 font-bold py-2">Features</a>
            <a href="#pricing" className="block text-slate-900 font-bold py-2">Pricing</a>
            <Link to="/auth" className="block pt-4">
              <Button className="w-full bg-indigo-600 h-12 rounded-xl font-bold">Get Started</Button>
            </Link>
          </motion.div>
        )}
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative pt-40 pb-24 px-6 lg:px-8 min-h-[90vh] flex items-center overflow-hidden bg-slate-50">
        {/* Modern Background Accents */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-[600px] h-[600px] bg-indigo-50 rounded-full mix-blend-multiply opacity-70 blur-3xl animate-pulse" />
          <div className="absolute top-1/2 -right-24 w-[500px] h-[500px] bg-teal-50 rounded-full mix-blend-multiply opacity-70 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        </div>

        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <motion.div
              style={{ opacity: heroOpacity, scale: heroScale }}
              className="text-center lg:text-left space-y-8"
            >
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Badge className="bg-white border border-slate-200 text-slate-600 px-4 py-2 text-xs font-black rounded-full uppercase tracking-widest shadow-sm">
                  <Star className="h-3 w-3 mr-2 inline text-amber-500 fill-amber-500" />
                  India's #1 Premium Tax Compliance Platform
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="text-5xl md:text-7xl font-black tracking-tight text-slate-950 leading-[0.95]"
              >
                Precision Tax
                <span className="block text-indigo-600">Compliance</span>
                <span className="block italic font-serif font-light text-slate-800">Redefined.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8 }}
                className="text-xl text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0 font-medium"
              >
                TaxMitra empowers business owners and professionals with AI-driven tax intelligence. From complex Crypto audits to seamless GST filings – experience a tax journey that is accurate, expert-led, and entirely stress-free.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6"
              >
                <Link to="/auth">
                  <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 h-16 px-12 rounded-2xl text-lg font-black shadow-2xl shadow-indigo-200 group transition-all hover:scale-105 active:scale-95">
                    Start Your Filing
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <div className="flex flex-col items-start gap-1">
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-10 w-10 rounded-full border-4 border-white bg-slate-200 overflow-hidden ring-2 ring-indigo-50">
                        <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-slate-500 ml-1">Joined by 85k+ Professionals</p>
                </div>
              </motion.div>
            </motion.div>

            {/* Right: Premium Dashboard Visualization */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotateY: 20 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="relative perspective-2000 hidden lg:block"
            >
              <Float3D>
                <div className="relative rounded-[40px] p-2 bg-gradient-to-br from-indigo-500/10 via-slate-200 to-indigo-500/10 shadow-2xl">
                  <div className="bg-slate-900 rounded-[32px] overflow-hidden border border-white/10 shadow-inner p-1">
                    {/* Dashboard Content Mockup */}
                    <div className="bg-[#0f172a] p-8 space-y-8 min-h-[500px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <Activity className="h-4 w-4 text-white" />
                          </div>
                          <span className="text-white font-black text-sm uppercase tracking-widest">Tax Console</span>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px]">AY 2026-27 ACTIVE</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-2">
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Total Liability</p>
                          <p className="text-3xl font-black text-white">₹4,500</p>
                        </div>
                        <div className="p-6 rounded-3xl bg-indigo-600 space-y-2 shadow-xl shadow-indigo-600/20">
                          <p className="text-white/70 text-[10px] font-black uppercase tracking-wider">Total Tax Saved</p>
                          <p className="text-3xl font-black text-white">₹1.2L</p>
                        </div>
                      </div>

                      <div className="relative h-48 w-full bg-slate-800/50 rounded-3xl border border-white/5 overflow-hidden p-6">
                        <div className="flex justify-between items-end h-full gap-2">
                          {[40, 70, 45, 90, 65, 80, 50].map((h, i) => (
                            <motion.div
                              key={i}
                              initial={{ height: 0 }}
                              animate={{ height: `${h}%` }}
                              transition={{ delay: 1 + (i * 0.1), duration: 1 }}
                              className={`flex-1 rounded-full ${i === 3 ? 'bg-indigo-500' : 'bg-slate-700/50 hover:bg-indigo-400/50 transition-colors'}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 1.5, type: "spring" }}
                          className="bg-white/90 backdrop-blur-3xl rounded-[32px] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/50 text-center min-w-[320px]"
                        >
                          <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                          </div>
                          <h4 className="text-2xl font-black text-slate-900">Tax Filed Successfully</h4>
                          <p className="text-slate-500 text-sm font-bold mt-2">Fiscal Year 2023-24 Consolidated</p>
                          <Button className="w-full mt-6 bg-slate-900 h-12 rounded-xl font-bold">Download Ack Receipt</Button>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
              </Float3D>

              {/* Decorative Floating Icons */}
              <div className="absolute -top-12 -right-12 h-24 w-24 bg-white rounded-3xl shadow-2xl flex items-center justify-center border border-slate-100 animate-bounce" style={{ animationDuration: "3s" }}>
                <Bitcoin className="h-10 w-10 text-orange-400" />
              </div>
              <div className="absolute -bottom-16 -left-16 h-32 w-32 bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 p-8 space-y-4">
                <div className="h-2 w-full bg-indigo-100 rounded-full" />
                <div className="h-2 w-3/4 bg-slate-100 rounded-full" />
                <div className="h-2 w-1/2 bg-slate-100 rounded-full" />
                <PieChart className="h-8 w-8 text-indigo-600 mt-4 mx-auto" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== TRUSTED BY MARQUEE / STATS ===== */}
      <section className="py-16 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 items-center text-center">
            <div className="space-y-1">
              <p className="text-4xl font-black text-slate-950">₹3.5B+</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Tax Refunded</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-indigo-600">99.9%</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Accuracy Rate</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-slate-950">85,000+</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Active Users</p>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-black text-teal-500">24/7</p>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Expert Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CORE SOLUTIONS SECTION ===== */}
      <section id="solutions" className="py-32 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimatedSection className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-20">
            <div className="max-w-2xl">
              <Badge className="bg-indigo-50 text-indigo-600 px-4 py-1.5 text-xs font-black rounded-full mb-6 tracking-widest uppercase">Expert Ecosystem</Badge>
              <h2 className="text-4xl md:text-6xl font-black text-slate-950 tracking-tighter leading-none">
                Beyond Automated <br />
                <span className="text-indigo-600">Calculations.</span>
              </h2>
            </div>
            <p className="text-lg text-slate-500 font-medium max-w-sm">
              We bridge the gap between AI efficiency and human expertise for a bulletproof tax strategy.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Advanced Crypto Compliance",
                desc: "Industry-leading Section 115BBH matching engine with KoinX-level accuracy for VDA schedules.",
                icon: <Bitcoin className="h-8 w-8" />,
                color: "bg-orange-500"
              },
              {
                title: "Business Wealth Intelligence",
                desc: "Automated P&L drafting, GST reconciliation, and balance sheet preparation for SMBs.",
                icon: <Building2 className="h-8 w-8" />,
                color: "bg-indigo-600"
              },
              {
                title: "Global Asset Reporting",
                desc: "Specialized handling for Foreign Stocks (Schedule FA), RSUs, and international income tax credits.",
                icon: <Globe className="h-8 w-8" />,
                color: "bg-teal-500"
              }
            ].map((solution, i) => (
              <AnimatedSection key={i} delay={i * 0.15}>
                <motion.div
                  whileHover={{ y: -10 }}
                  className="p-10 rounded-[40px] bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-2xl hover:shadow-indigo-100 transition-all group"
                >
                  <div className={`h-16 w-16 ${solution.color} rounded-2xl flex items-center justify-center text-white mb-8 shadow-xl`}>
                    {solution.icon}
                  </div>
                  <h3 className="text-2xl font-black text-slate-950 mb-4">{solution.title}</h3>
                  <p className="text-slate-600 leading-relaxed font-medium">{solution.desc}</p>
                  <Button variant="ghost" className="mt-8 p-0 text-indigo-600 font-black hover:bg-transparent group-hover:gap-3 transition-all">
                    Learn More <ArrowRight className="h-5 w-5" />
                  </Button>
                </motion.div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROFESSIONAL FEATURES GRID ===== */}
      <section id="features" className="py-32 px-6 lg:px-8 bg-slate-950 text-white relative overflow-hidden">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 h-[600px] w-[600px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[600px] w-[600px] bg-teal-600/10 blur-[150px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <AnimatedSection className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-none mb-6">
              Empowering the <br />
              <span className="text-indigo-400">Professional Era.</span>
            </h2>
            <p className="mt-6 text-xl text-slate-400 max-w-2xl mx-auto font-medium">
              Enterprise-grade infrastructure designed for individual filers, CA firms, and corporate entities.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: <Target className="text-indigo-400" />, title: "Precision Form Selector", desc: "Our proprietary logic predicts the correct ITR (1-4) based on your income footprint, eliminating filing errors." },
              { icon: <Zap className="text-amber-400" />, title: "Live AIS Reconciliation", desc: "Instantly cross-check your tax statement with your ledgers to detect discrepancies before submission." },
              { icon: <Search className="text-teal-400" />, title: "Audit Trail Analysis", desc: "Maintain a complete digital trail for every deduction claimed, ensuring you are 100% audit-ready." },
              { icon: <Users className="text-purple-400" />, title: "Family & Firm Managed Hub", desc: "Consolidated dashboard to manage multiple PANs, clients, or family members under one secure vault." },
              { icon: <Bot className="text-rose-400" />, title: "Intelligent Regime Optimizer", desc: "AI-simulated comparisons of Old vs New regimes with detailed tax-saving recommendations." },
              { icon: <ShieldCheck className="text-emerald-400" />, title: "Military-Grade Security", desc: "AES-256 bit encryption and SOC 2 Type II compliance ensure your financial data remains private." },
            ].map((feature, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.08}>
                <div className="p-10 rounded-[32px] bg-white/5 border border-white/10 hover:border-indigo-500/50 transition-all h-full group">
                  <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed font-medium">{feature.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HIRE AN EXPERT SECTION ===== */}
      <section id="expert" className="py-32 px-6 lg:px-8 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative rounded-[60px] bg-indigo-600 p-12 md:p-24 overflow-hidden shadow-3xl">
            {/* Decorative Background */}
            <div className="absolute top-0 right-0 h-full w-1/2 bg-gradient-to-l from-white/10 to-transparent flex items-center justify-center">
              <Briefcase className="h-[400px] w-[400px] text-white/5 -rotate-12 translate-x-32" />
            </div>

            <div className="relative z-10 max-w-2xl">
              <Badge className="bg-white/20 text-white font-black px-4 py-2 border-none rounded-full mb-8">CA-ASSISTED FILING</Badge>
              <h2 className="text-4xl md:text-6xl font-black text-white leading-[0.9] tracking-tighter mb-8">
                Complex Portfolio? <br />
                <span className="text-indigo-200">Our Experts </span>
                Got You.
              </h2>
              <p className="text-xl text-indigo-100 font-medium mb-12 leading-relaxed">
                Don't leave your compliance to chance. For a small fee, hire a dedicated Tax Expert to review your filing, maximize deductions, and handle data-heavy audits.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 h-16 px-10 rounded-2xl text-lg font-black group">
                  Book Expert Review
                  <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button size="lg" variant="outline" className="h-16 px-8 rounded-2xl text-lg font-bold border-2 border-white/50 text-white bg-white/10 hover:bg-white/20">
                  View Pricing Plans
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-32 px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-24">
            <h2 className="text-4xl md:text-6xl font-black tracking-tight text-slate-950">
              Transparent <span className="text-indigo-600">Pricing.</span>
            </h2>
            <p className="mt-6 text-xl text-slate-500 max-w-2xl mx-auto font-medium">Simple, scalable plans for every financial footprint.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                name: "Standard",
                price: "Free",
                desc: "Classic Salary & House Property",
                features: ["ITR-1 Filing", "AI Regime Optimizer", "Standard Deduction Check", "Document Vault (1GB)"],
                color: "slate-900",
                cta: "Start Free Filing"
              },
              {
                name: "Premium Pro",
                price: "₹499",
                priceDesc: "Per Fin. Year",
                desc: "Calculations for Stocks & VDS",
                features: ["ITR-1, 2, 3, 4 Support", "Full Crypto Audit Engine", "AIS Recon Dashboard", "Foreign Asset Schedule", "Priority Support"],
                popular: true,
                color: "indigo-600",
                cta: "Get Pro Access"
              },
              {
                name: "Assisted",
                price: "Var.",
                desc: "Expert-Led Tax Optimization",
                features: ["Chartered Accountant Review", "Audit Defense Pack", "Customized Tax Planning", "Representation Support (Optional)", "Firm Hub Access"],
                color: "teal-600",
                cta: "Hire Expert Now"
              },
            ].map((plan, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.1}>
                <div className={`relative rounded-[40px] p-10 h-full flex flex-col ${plan.popular ? 'bg-indigo-600 text-white shadow-3xl' : 'bg-white border border-slate-200'}`}>
                  {plan.popular && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-slate-950 text-white font-black px-6 py-2 rounded-full border-none shadow-xl tracking-widest uppercase text-[10px]">Most Preferred</Badge>
                    </div>
                  )}
                  <h3 className="text-2xl font-black mb-1">{plan.name}</h3>
                  <p className={`text-sm font-bold mb-10 ${plan.popular ? 'text-indigo-200' : 'text-slate-400'}`}>{plan.desc}</p>

                  <div className="mb-10">
                    <span className="text-5xl font-black">{plan.price}</span>
                    {plan.priceDesc && <span className={`text-sm block font-bold ${plan.popular ? 'text-indigo-200' : 'text-slate-400'}`}>{plan.priceDesc}</span>}
                  </div>

                  <div className="flex-1 space-y-4 mb-12">
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-4 text-sm font-bold">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${plan.popular ? 'bg-indigo-500' : 'bg-slate-100'}`}>
                          <CheckCircle2 className={`h-4 w-4 ${plan.popular ? 'text-white' : 'text-indigo-600'}`} />
                        </div>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <Button className={`w-full h-16 rounded-2xl font-black text-lg shadow-xl ${plan.popular ? 'bg-white text-indigo-600 hover:bg-indigo-50 shadow-indigo-700/50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                    {plan.cta}
                  </Button>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-40 px-6 lg:px-8 bg-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-slate-50 rounded-full blur-3xl opacity-50" />
        </div>

        <AnimatedSection className="max-w-5xl mx-auto text-center relative z-10">
          <h2 className="text-5xl md:text-8xl font-black text-slate-950 tracking-[.01em] leading-none mb-10">
            File with <br />
            <span className="text-indigo-600 italic font-serif font-light">Certainty.</span>
          </h2>
          <p className="mt-8 text-2xl text-slate-600 max-w-2xl mx-auto font-medium leading-relaxed">
            Join the thousands of smart professionals who have transformed tax filing into a strategic advantage.
          </p>
          <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link to="/auth">
              <Button size="lg" className="bg-slate-950 text-white hover:bg-slate-800 h-16 px-16 rounded-2xl text-xl font-black group shadow-3xl">
                Ready to Start
                <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-slate-400">
            <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">SOC 2 TYPE II</span></div>
            <div className="flex items-center gap-2"><Shield className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-widest">AES-256 BANK GRADE</span></div>
          </div>
        </AnimatedSection>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-slate-950 text-white py-24 px-6 lg:px-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-16">
            <div className="md:col-span-2 space-y-8">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="text-white h-6 w-6" />
                </div>
                <span className="text-2xl font-black tracking-tight">TaxMitra</span>
              </div>
              <p className="text-slate-400 font-medium leading-loose max-w-xs">
                India's premier tax intelligence platform. Empowering financial compliance through automation and human expertise.
              </p>
              <div className="flex items-center gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all cursor-pointer border border-white/5">
                    <div className="h-4 w-4 bg-slate-500 rounded-sm" />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h4 className="font-black text-xs uppercase tracking-[.2em] text-indigo-400">Solutions</h4>
              <ul className="space-y-4 text-sm font-bold text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Business Tax Console</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Crypto Tax Engine</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Individual ITR filing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Firm Workflow Hub</a></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="font-black text-xs uppercase tracking-[.2em] text-indigo-400">Company</h4>
              <ul className="space-y-4 text-sm font-bold text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Expert Network</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Regulatory Compliance</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Data Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Relations</a></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="font-black text-xs uppercase tracking-[.2em] text-indigo-400">Support</h4>
              <ul className="space-y-4 text-sm font-bold text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Filing Helpdesk</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Tax Knowledge Base</a></li>
                <li><a href="#" className="hover:text-white transition-colors">ITR Ack Tracker</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Documentation</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-32 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">© 2026 TaxMitra Technologies Private Limited. All Rights Reserved.</p>
            <div className="flex items-center gap-8">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Privacy Protocol</span>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Security Framework</span>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">ISO 27001 Certified</span>
            </div>
          </div>
        </div>
      </footer>

      {/* AI Chatbot */}
      <TaxChatbot />
    </div>
  );
}
