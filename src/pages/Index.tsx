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
        rotateZ: [-2, 2, -2]
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
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-purple-500 to-teal-400 z-[100] origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* ===== NAVIGATION ===== */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="TaxMitra" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-teal-500 bg-clip-text text-transparent">
                TaxMitra
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-10">
              <a href="#how-it-works" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">How It Works</a>
              <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">Features</a>
              <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">Pricing</a>
              <a href="#testimonials" className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">Testimonials</a>
            </nav>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" className="font-semibold">Sign In</Button>
              </Link>
              <Link to="/auth">
                <Button className="bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 shadow-lg shadow-indigo-200 font-semibold rounded-full px-6">
                  Start Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2">
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="md:hidden bg-white border-t border-slate-100 px-6 py-6 space-y-4"
          >
            <a href="#how-it-works" className="block text-slate-700 font-medium py-2">How It Works</a>
            <a href="#features" className="block text-slate-700 font-medium py-2">Features</a>
            <a href="#pricing" className="block text-slate-700 font-medium py-2">Pricing</a>
            <Link to="/auth" className="block">
              <Button className="w-full bg-gradient-to-r from-indigo-600 to-teal-500">Get Started</Button>
            </Link>
          </motion.div>
        )}
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative pt-32 pb-20 px-6 lg:px-8 min-h-screen flex items-center overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-teal-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: "2s" }} />
        </div>

        <div className="max-w-7xl mx-auto w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Content */}
            <motion.div
              style={{ opacity: heroOpacity, scale: heroScale }}
              className="text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Badge className="bg-gradient-to-r from-indigo-100 to-teal-100 text-indigo-700 hover:from-indigo-100 hover:to-teal-100 px-4 py-2 text-sm font-semibold rounded-full mb-8">
                  <Sparkles className="h-4 w-4 mr-2 inline text-teal-500" />
                  Trusted by 75,000+ Indians • AY 2026-27 Ready
                </Badge>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 leading-[1.05]"
              >
                Your Personal
                <span className="block bg-gradient-to-r from-indigo-600 via-purple-500 to-teal-500 bg-clip-text text-transparent">
                  Tax Assistant.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8 text-xl text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0"
              >
                <strong>TaxMitra</strong> makes filing taxes as easy as chatting with a friend.
                Income Tax, GST, Crypto – all handled. <span className="text-indigo-600 font-semibold">Expert Tax Consultants available after payment.</span>
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-10 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
              >
                <Link to="/auth">
                  <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 h-14 px-10 rounded-full text-lg font-bold shadow-xl shadow-indigo-200 group">
                    Start Filing Free
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-lg font-semibold border-2 gap-3 group">
                  <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                    <Play className="h-4 w-4 fill-indigo-600 text-indigo-600 ml-0.5" />
                  </div>
                  Watch Demo
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-slate-500"
              >
                <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-teal-500" /> No credit card</span>
                <span className="flex items-center gap-2"><Shield className="h-5 w-5 text-teal-500" /> Bank-grade encryption</span>
                <span className="flex items-center gap-2"><Clock className="h-5 w-5 text-teal-500" /> 15 min to file</span>
              </motion.div>
            </motion.div>

            {/* Right: 3D Dashboard Preview */}
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="relative hidden lg:block"
            >
              <Float3D>
                <Card3D className="rounded-3xl overflow-hidden shadow-2xl border border-slate-200 bg-white">
                  <div className="p-6 bg-gradient-to-br from-slate-50 to-white">
                    {/* Mock Dashboard */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-3 w-3 rounded-full bg-rose-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 p-4 text-white">
                        <p className="text-xs opacity-70">Tax Saved</p>
                        <p className="text-2xl font-black mt-1">₹1.2L</p>
                      </div>
                      <div className="h-24 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 p-4 text-white">
                        <p className="text-xs opacity-70">Refund</p>
                        <p className="text-2xl font-black mt-1">₹45K</p>
                      </div>
                      <div className="h-24 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 p-4 text-white">
                        <p className="text-xs opacity-70">ITR Form</p>
                        <p className="text-2xl font-black mt-1">ITR-2</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                      <div className="h-12 rounded-xl bg-slate-100 animate-pulse" style={{ animationDelay: "0.2s" }} />
                      <div className="h-12 rounded-xl bg-slate-100 animate-pulse" style={{ animationDelay: "0.4s" }} />
                    </div>
                  </div>
                </Card3D>
              </Float3D>

              {/* Floating Elements */}
              <Float3D delay={0.5} duration={4}>
                <div className="absolute -top-6 -right-6 bg-white rounded-2xl shadow-xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status</p>
                      <p className="font-bold text-emerald-600">Filed Successfully!</p>
                    </div>
                  </div>
                </div>
              </Float3D>

              <Float3D delay={1} duration={5}>
                <div className="absolute -bottom-4 -left-8 bg-white rounded-2xl shadow-xl p-4 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">AI Suggestion</p>
                      <p className="font-bold text-slate-900">New Regime saves ₹45K</p>
                    </div>
                  </div>
                </div>
              </Float3D>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== COMPETITOR COMPARISON ===== */}
      <section className="py-20 border-y border-slate-100 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
              Why Indians Choose TaxMitra?
            </h2>
            <p className="mt-4 text-slate-500">See how we stack up against the old-school players.</p>
          </AnimatedSection>

          <div className="overflow-x-auto">
            <div className="min-w-[800px] grid grid-cols-4 gap-4 text-sm">
              {/* Header */}
              <div className="col-span-1 p-4 font-bold text-slate-400">Feature</div>
              <div className="col-span-1 p-3 rounded-t-xl bg-white border border-indigo-100 text-center font-bold text-indigo-600 shadow-sm flex items-center justify-center gap-2">
                <img src="/logo.png" className="h-6 w-6 rounded-md" /> TaxMitra
              </div>
              <div className="col-span-1 p-4 text-center font-bold text-slate-500">Traditional CAs</div>
              <div className="col-span-1 p-4 text-center font-bold text-slate-500">Other Portals</div>

              {/* Rows */}
              {[
                { feature: "Pricing (Basic)", taxmitra: "Free", ca: "₹1,500+", others: "₹499+" },
                { feature: "AI Tax Suggestions", taxmitra: "Included", ca: "Depends", others: "Paid Add-on" },
                { feature: "Crypto Audit (115BBH)", taxmitra: "Automated", ca: "Manual", others: "Manual / Complex" },
                { feature: "Time to File", taxmitra: "15 Mins", ca: "2-3 Days", others: "45 Mins" },
                { feature: "Audit Defense Pack", taxmitra: "Included", ca: "Extra Charge", others: "Not Available" },
              ].map((row, i) => (
                <div key={i} className="contents group">
                  <div className="col-span-1 p-4 font-medium text-slate-700 border-b border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition-colors flex items-center">
                    {row.feature}
                  </div>
                  <div className="col-span-1 p-4 text-center font-bold text-slate-900 border-x border-indigo-100 bg-white shadow-sm flex items-center justify-center">
                    {row.taxmitra === "Included" || row.taxmitra === "Automated" ? <CheckCircle2 className="h-5 w-5 text-emerald-500 inline mr-1" /> : null}
                    {row.taxmitra}
                  </div>
                  <div className="col-span-1 p-4 text-center text-slate-500 border-b border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition-colors flex items-center justify-center">
                    {row.ca}
                  </div>
                  <div className="col-span-1 p-4 text-center text-slate-500 border-b border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition-colors flex items-center justify-center">
                    {row.others}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== EDUCATIONAL / ZERO INCOME BENEFITS ===== */}
      <section className="py-20 px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <AnimatedSection>
              <div className="relative">
                <div className="absolute -top-10 -left-10 h-64 w-64 bg-teal-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
                <div className="absolute -bottom-10 -right-10 h-64 w-64 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
                <Card3D className="relative bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
                  <div className="p-8">
                    <Badge className="bg-amber-100 text-amber-700 mb-6">Did You Know?</Badge>
                    <h3 className="text-3xl font-black text-slate-900 mb-6">Why file ITR even with 0 Tax?</h3>
                    <ul className="space-y-4">
                      {[
                        "Standard Proof of Income for Loans & Visas",
                        "Claim Tax Refunds (TDS deducted by bank/employer)",
                        "Carry Forward Losses (Stock market losses)",
                        "Fast-track Credit Card Approvals",
                        "Avoid Notices for High Value Transactions"
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0 mt-0.5" />
                          <span className="text-slate-600 font-medium">{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full mt-8 bg-slate-900 text-white hover:bg-slate-800 h-12 rounded-xl">
                      File Zero-Income ITR Now
                    </Button>
                  </div>
                </Card3D>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 mb-6">
                Compliance is <span className="text-teal-500">Power.</span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Even if you earn below ₹7 Lakhs and pay ZERO tax, filing your ITR creates a solid financial footprint.
                It allows you to build credit history, apply for global visas, and legally explain your wealth accumulation later.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-4xl font-black text-indigo-600 mb-2">8.2 Cr</p>
                  <p className="text-sm text-slate-500 font-medium">Indians filed ITR last year</p>
                </div>
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-4xl font-black text-teal-600 mb-2">₹3.3 Trn</p>
                  <p className="text-sm text-slate-500 font-medium">Refunds issued by IT Dept</p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="py-28 px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-20">
            <Badge className="bg-teal-100 text-teal-700 px-4 py-1.5 text-sm font-semibold rounded-full mb-6">
              <Zap className="h-4 w-4 mr-2 inline" /> Simple 3-Step Process
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
              File Taxes Like Texting a Friend
            </h2>
            <p className="mt-6 text-xl text-slate-500 max-w-2xl mx-auto">
              No confusing forms. No tax jargon. Just answer simple questions in plain English.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {[
              {
                step: "01",
                title: "Tell Us Your Story",
                description: "Got a salary? Trade stocks? Own crypto? Just check the boxes. TaxMitra automatically picks the right ITR form for you.",
                icon: <Users className="h-8 w-8" />,
                gradient: "from-indigo-500 to-indigo-600"
              },
              {
                step: "02",
                title: "AI Does the Math",
                description: "Our AI compares Old vs New tax regimes and picks the one that saves you the most money. Zero manual calculations.",
                icon: <Bot className="h-8 w-8" />,
                gradient: "from-purple-500 to-purple-600"
              },
              {
                step: "03",
                title: "Download & Done",
                description: "Get your ITR JSON file instantly. Upload to the Income Tax Portal. Congratulations, you're legally compliant!",
                icon: <Rocket className="h-8 w-8" />,
                gradient: "from-teal-500 to-teal-600"
              }
            ].map((item, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.15}>
                <Card3D className="relative p-8 rounded-3xl bg-white border border-slate-100 shadow-lg h-full">
                  <div className="absolute -top-4 left-8">
                    <span className="text-7xl font-black text-slate-100">{item.step}</span>
                  </div>
                  <div className={`relative h-16 w-16 rounded-2xl bg-gradient-to-br ${item.gradient} text-white flex items-center justify-center mb-6 shadow-lg`}>
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-500 leading-relaxed">{item.description}</p>
                </Card3D>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" className="py-28 px-6 lg:px-8 bg-slate-900 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <AnimatedSection className="text-center mb-20">
            <Badge className="bg-white/10 text-white px-4 py-1.5 text-sm font-semibold rounded-full mb-6">
              <Award className="h-4 w-4 mr-2 inline" /> Enterprise-Grade Features
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">
              Everything You Need. Nothing You Don't.
            </h2>
            <p className="mt-6 text-xl text-slate-400 max-w-2xl mx-auto">
              From ₹5 lakh salaries to ₹5 crore crypto portfolios – TaxMitra handles it all.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <FileText />, title: "Smart ITR Selection", desc: "ITR-1, 2, 3, or 4? Stop guessing. Answer questions, we pick the form.", gradient: "from-indigo-500 to-indigo-600" },
              { icon: <Bitcoin />, title: "Crypto Made Simple", desc: "Section 115BBH compliant. FIFO calculations. Schedule VDA auto-filled.", gradient: "from-amber-500 to-orange-500" },
              { icon: <Globe />, title: "Foreign Assets (FA)", desc: "US stocks via Vested? RSUs from Google? Schedule FA handled correctly.", gradient: "from-teal-500 to-cyan-500" },
              { icon: <Building2 />, title: "GST Intelligence", desc: "ITC reconciliation, GSTR-3B auto-fill, and vendor compliance tracking.", gradient: "from-purple-500 to-pink-500" },
              { icon: <BarChart3 />, title: "AIS Auto-Reconciliation", desc: "Catch errors before IT Department does. Avoid 143(1) notices.", gradient: "from-rose-500 to-red-500" },
              { icon: <Users />, title: "Family Tax Hub", desc: "Manage filings for your entire family from one dashboard.", gradient: "from-emerald-500 to-green-500" },
            ].map((feature, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.08}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -5 }}
                  className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all backdrop-blur-sm h-full"
                >
                  <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                </motion.div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-28 px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="bg-indigo-100 text-indigo-700 px-4 py-1.5 text-sm font-semibold rounded-full mb-6">
              Simple Pricing
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
              Start Free. Upgrade When Ready.
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "Starter",
                price: "Free",
                desc: "Perfect for simple salary income",
                features: ["ITR-1 Filing", "AI Tax Calculator", "Email Support", "1 User"],
                gradient: "from-slate-100 to-slate-50",
                border: "border-slate-200",
                cta: "Start Free",
                popular: false
              },
              {
                name: "Pro",
                price: "₹499",
                desc: "For stocks, crypto, and freelancers",
                features: ["ITR-1, 2, 3, 4", "Crypto Tax Engine", "AIS Reconciliation", "Priority Support", "Family Hub (3 members)"],
                gradient: "from-indigo-600 to-purple-600",
                border: "border-indigo-500",
                cta: "Get Pro",
                popular: true
              },
              {
                name: "Enterprise",
                price: "Custom",
                desc: "For CA Firms and Corporates",
                features: ["Unlimited Clients", "White-Label Option", "API Access", "Dedicated Manager", "Audit Defense Pack"],
                gradient: "from-slate-800 to-slate-900",
                border: "border-slate-700",
                cta: "Contact Sales",
                popular: false
              },
            ].map((plan, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.1}>
                <Card3D className={`relative rounded-3xl p-8 ${plan.popular ? 'bg-gradient-to-br ' + plan.gradient + ' text-white' : 'bg-white border ' + plan.border}`}>
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-white text-indigo-600 font-bold px-4 py-1 shadow-lg">MOST POPULAR</Badge>
                    </div>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className={`text-sm mt-1 ${plan.popular ? 'text-white/70' : 'text-slate-500'}`}>{plan.desc}</p>
                  <div className="mt-6">
                    <span className="text-4xl font-black">{plan.price}</span>
                    {plan.price !== "Free" && plan.price !== "Custom" && <span className={plan.popular ? 'text-white/70' : 'text-slate-500'}>/year</span>}
                  </div>
                  <ul className="mt-8 space-y-3">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm">
                        <CheckCircle2 className={`h-5 w-5 ${plan.popular ? 'text-teal-300' : 'text-teal-500'}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className={`w-full mt-8 h-12 rounded-full font-bold ${plan.popular ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                    {plan.cta}
                  </Button>
                </Card3D>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section id="testimonials" className="py-28 px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <Badge className="bg-rose-100 text-rose-700 px-4 py-1.5 text-sm font-semibold rounded-full mb-6">
              <Heart className="h-4 w-4 mr-2 inline fill-rose-500" /> Customer Love
            </Badge>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900">
              75,000+ Happy Tax Filers
            </h2>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: "Ananya Deshmukh", role: "Software Engineer, Bangalore", quote: "I had crypto gains, US stocks, and RSUs. I thought I needed a CA charging ₹15K. TaxMitra did it in 20 minutes for ₹499!", rating: 5, avatar: "A" },
              { name: "Rohan Kapoor", role: "Freelance Designer, Mumbai", quote: "I was confused about ITR-3 vs ITR-4, presumptive taxation, all that jazz. TaxMitra just asked 'Do you invoice clients?' and figured it out.", rating: 5, avatar: "R" },
              { name: "Priya Sharma, CA", role: "Managing Partner, PS Associates", quote: "We use TaxMitra Firm Hub to manage 500+ client filings. The AIS reconciliation alone has saved us 400+ hours this season.", rating: 5, avatar: "P" },
            ].map((testimonial, idx) => (
              <AnimatedSection key={idx} delay={idx * 0.1}>
                <Card3D className="p-8 rounded-3xl bg-slate-50 border border-slate-100 h-full">
                  <div className="flex gap-1 mb-6">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-slate-700 text-lg leading-relaxed mb-8">"{testimonial.quote}"</p>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{testimonial.name}</p>
                      <p className="text-sm text-slate-500">{testimonial.role}</p>
                    </div>
                  </div>
                </Card3D>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-28 px-6 lg:px-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-teal-500 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-10" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-10" />
        </div>

        <AnimatedSection className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight">
            Ready to File Taxes the Smart Way?
          </h2>
          <p className="mt-6 text-xl text-white/80 max-w-2xl mx-auto">
            Join 75,000+ Indians who filed their taxes without stress. Start for free today.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="bg-white text-indigo-700 hover:bg-indigo-50 h-16 px-12 rounded-full text-lg font-black shadow-2xl group">
                Start Filing for Free
                <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
          <p className="mt-8 text-white/60 text-sm">No credit card required. File your first ITR in under 15 minutes.</p>
        </AnimatedSection>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-slate-900 text-white py-20 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-5 gap-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <img src="/logo.png" alt="TaxMitra" className="h-10 w-10 rounded-xl" />
                <span className="text-xl font-bold">TaxMitra</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                Your personal tax assistant. Making Indian tax compliance simple, accurate, and stress-free since 2024.
              </p>
              <div className="flex items-center gap-4 mt-6">
                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" /></svg>
                </div>
                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Income Tax Filing</a></li>
                <li><a href="#" className="hover:text-white transition-colors">GST Returns</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Crypto Tax Calculator</a></li>
                <li><a href="#" className="hover:text-white transition-colors">CA Firm Hub</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Resources</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">Tax Guides</a></li>
                <li><a href="#" className="hover:text-white transition-colors">ITR Form Selector</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Regime Calculator</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">© 2026 TaxMitra Technologies Pvt. Ltd. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> SOC 2 Compliant</span>
              <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> AES-256 Encrypted</span>
              <span className="flex items-center gap-2"><Award className="h-4 w-4" /> ISO 27001</span>
            </div>
          </div>
        </div>
      </footer>

      {/* AI Chatbot */}
      <TaxChatbot />
    </div>
  );
}
