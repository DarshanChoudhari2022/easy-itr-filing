import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    FolderLock,
    Upload,
    Search,
    FileText,
    MoreVertical,
    Download,
    Trash2,
    FileCheck2,
    Filter,
    CloudUpload
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface VaultDoc {
    id: string;
    name: string;
    type: string;
    year: string;
    size: string;
    status: "Verified" | "Pending" | "Processing";
}

export default function TaxVault() {
    const [docs] = useState<VaultDoc[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredDocs = docs.filter(doc =>
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const verifiedCount = docs.filter(d => d.status === "Verified").length;
    const totalSizeMB = docs.length > 0
        ? docs.reduce((sum, d) => sum + parseFloat(d.size), 0).toFixed(1)
        : "0";

    return (
        <AppLayout>
            <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                            <FolderLock className="h-8 w-8 text-emerald-500" />
                            Secure Tax Vault
                        </h1>
                        <p className="text-muted-foreground italic">Encrypted storage for all your audit-critical documents.</p>
                    </div>
                    <div className="flex gap-3">
                        {docs.length > 0 && (
                            <Button variant="outline" className="gap-2">
                                <Download className="h-4 w-4" /> Bulk Download
                            </Button>
                        )}
                        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Upload className="h-4 w-4" /> Upload Document
                        </Button>
                    </div>
                </div>

                {/* Storage Summary */}
                <div className="grid gap-6 md:grid-cols-4">
                    <Card className="bg-emerald-50/20 border-emerald-100">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-emerald-700 uppercase">Storage Used</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black text-emerald-900">{totalSizeMB} MB</p>
                            <Progress value={docs.length > 0 ? Math.min((parseFloat(totalSizeMB) / 300) * 100, 100) : 0} className="h-1.5 mt-2 bg-emerald-100" />
                            <p className="text-[10px] text-muted-foreground mt-2">of 300MB Free Tier</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Verified Docs</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black">{verifiedCount}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                <FileCheck2 className="h-3 w-3 text-emerald-500" /> Auto-parsed by AI
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Total Documents</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black">{docs.length}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Upload documents to get started</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Retention</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-black text-indigo-500">8 Years</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Complies with Section 147</p>
                        </CardContent>
                    </Card>
                </div>

                {/* File Explorer */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Document Explorer</CardTitle>
                                <CardDescription>Search by year, category, or filename.</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 max-w-sm w-full">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search documents..."
                                        className="pl-8"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <Button variant="outline" size="icon">
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {filteredDocs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                                    <CloudUpload className="h-8 w-8 text-emerald-400" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                                    Upload your Form 16, bank statements, investment proofs, and other tax documents to keep them securely organized.
                                </p>
                                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                    <Upload className="h-4 w-4" /> Upload Your First Document
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {filteredDocs.map((doc) => (
                                    <div key={doc.id} className="p-4 rounded-xl border group hover:border-emerald-200 hover:bg-emerald-50/10 transition-all flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                <FileText className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold truncate max-w-[200px]">{doc.name}</h4>
                                                <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className="text-[8px] py-0 px-1 border-emerald-100 text-emerald-700">{doc.year}</Badge>
                                                    <span>{doc.type}</span>
                                                    <span>•</span>
                                                    <span>{doc.size}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Badge className={doc.status === 'Verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                                {doc.status}
                                            </Badge>
                                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <Download className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <Trash2 className="h-4 w-4 text-rose-400" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Audit Disclaimer */}
                <div className="p-4 rounded-xl border border-dashed border-muted bg-muted/5 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <FolderLock className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                        All documents are stored with AES-256 encryption. We automatically suggest missing documents based on your declarations to ensure you are ready for any Section 143(1) or 143(2) scrutiny.
                    </p>
                </div>
            </div>
        </AppLayout>
    );
}
