import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { askTaxGuru, UserTaxContext } from "@/lib/ai-service";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
}

interface TaxChatbotProps {
    taxContext?: UserTaxContext;
}

export default function TaxChatbot({ taxContext }: TaxChatbotProps = {}) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content: "👋 Hi! I'm TaxMitra AI, your personal tax assistant. Ask me anything about Indian Income Tax, GST, Crypto taxation, or filing ITR!",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await askTaxGuru(input.trim(), taxContext);
            let content = response.answer;
            if (response.disclaimer) {
                content += '\n\n---\n' + response.disclaimer;
            }
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const quickQuestions = [
        "Which regime is better for me?",
        "How is crypto taxed in India?",
        "Explain my tax summary",
        "How to maximize deductions?",
        "What is Section 80C?",
        "How to file ITR online?",
    ];

    return (
        <>
            {/* Floating Trigger Button */}
            <motion.button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full bg-gradient-to-br from-indigo-600 to-teal-500 shadow-2xl shadow-indigo-500/30 flex items-center justify-center hover:scale-110 transition-transform"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
            >
                {isOpen ? (
                    <X className="h-7 w-7 text-white" />
                ) : (
                    <MessageCircle className="h-7 w-7 text-white" />
                )}
            </motion.button>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-teal-500 p-5">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                                    <Bot className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-white text-lg">TaxMitra AI</h3>
                                    <p className="text-white/80 text-sm flex items-center gap-1">
                                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                        Online • Powered by AI
                                    </p>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 min-h-[300px] max-h-[400px]">
                            {messages.map((message) => (
                                <motion.div
                                    key={message.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                                >
                                    <div
                                        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${message.role === "user"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-gradient-to-br from-indigo-500 to-teal-500 text-white"
                                            }`}
                                    >
                                        {message.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                    </div>
                                    <div
                                        className={`max-w-[75%] p-3 rounded-2xl text-sm leading-relaxed ${message.role === "user"
                                            ? "bg-indigo-600 text-white rounded-br-md"
                                            : "bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm"
                                            }`}
                                    >
                                        {message.content}
                                    </div>
                                </motion.div>
                            ))}

                            {isLoading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex gap-3"
                                >
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-teal-500 flex items-center justify-center">
                                        <Sparkles className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md p-3 shadow-sm">
                                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Thinking...
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Questions */}
                        {messages.length <= 1 && (
                            <div className="px-4 pb-3 bg-slate-50">
                                <p className="text-xs text-slate-400 mb-2 font-medium">Try asking:</p>
                                <div className="flex flex-wrap gap-2">
                                    {quickQuestions.map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => setInput(q)}
                                            className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-full hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Input */}
                        <div className="p-4 border-t border-slate-100 bg-white">
                            <div className="flex gap-2">
                                <Input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Ask about ITR, GST, Crypto..."
                                    className="flex-1 rounded-full border-slate-200 focus:ring-indigo-500"
                                    disabled={isLoading}
                                />
                                <Button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 p-0"
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center justify-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                AI guidance only — not legal tax advice. Consult a CA for specifics.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
