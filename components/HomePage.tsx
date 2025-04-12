import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { checkFreeUsage, useOneFreeGeneration } from '@lib/usageChecker';
// 修正导入
import { useAuth } from '@/contexts/AuthContext';
import UpgradeModal from '@components/UpgradeModal';
import AdModal from './AdModal';
import ImageViewerModal from './ImageViewerModal';
import TurnstileModal from './TurnstileModal';
import ImageComparisonCard from './ImageComparisonCard';

// 定义历史记录类型
interface HistoryItem {
    originalImages: string[];
    generatedImage: string;
    timestamp: number;
    prompt?: string;
    size?: string; // Add size parameter
}

// 定义工具类型
interface Tool {
    id: string;
    name: string;
    description: string;
    logo: string;
    url: string;
    isHot: boolean;
}

const MAX_FREE = 3;
const MAX_IMAGES = 5;
const FREE_MAX_IMAGES = 1;

const CHECK_STATUS_INTERVAL = 60000;

const HomePage = () => {
    // 使用AuthContext
    const { user, credits, setIsLoginModalOpen, setLoginModalRedirectTo, getAccessToken } = useAuth();

    const [prompt, setPrompt] = useState('');
    const [selectedImage, setSelectedImage] = useState('');
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [generationError, setGenerationError] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showPreGenAd, setShowPreGenAd] = useState(false);
    const [showPostGenAd, setShowPostGenAd] = useState(false);
    const [isResultBlurred, setIsResultBlurred] = useState(false);
    const [pendingGeneration, setPendingGeneration] = useState(false);
    const [showTurnstile, setShowTurnstile] = useState(false);
    const [freeCredits, setFreeCredits] = useState(0);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);
    const [selectedSize, setSelectedSize] = useState('1:1'); // Default size is 1:1

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 热门工具列表
    const hotTools: Tool[] = [
        {
            id: 'action-figure',
            name: 'Action Figure Generator',
            description: 'Transform photo into action figure',
            logo: '/action-figure-logo.png',
            url: '/action-figure-ai',
            isHot: true
        },
        {
            id: 'ghibli-style',
            name: 'Ghibli Style Image Generator',
            description: 'Convert photos into Studio Ghibli style',
            logo: '/ghibli-style-logo.png',
            url: '/ghibli-style-image-generator',
            isHot: true
        }
    ];

    // Simplified example structure to handle different combinations
    const inspirationExamples = [
        {
            originals: ["/examples/action-figure/original-1.jpg"],
            generated: "/examples/action-figure/action-figure-1.png",
            prompt: 'Transform the uploaded photo into a full-body action figure toy rendered in a clean, cartoonish 3D style with an original blister pack packaging featuring bold blue and yellow accents, the title "CR7 Strikeforce" and the tagline "Unstoppable on Any Field!", including detailed accessories such as a golden soccer ball, interchangeable cleats, a Portugal jersey, a trophy stand, and signature celebration arms.',
            toolLink: '/action-figure-ai'
        },
        {
            // Example with no input image, only output
            originals: ["/examples/action-figure/original-2.jpg"],
            generated: "/examples/action-figure/action-figure-2.png",
            prompt: 'Transform the uploaded photo into a full-body action figure toy rendered in a clean, cartoonish 3D style, presented in an original blister pack packaging with bold navy blue and vibrant yellow accents. Title it "BEZOS PRIME COMMANDER" and use the tagline "Delivering the Future!". Include detailed accessories such as a miniature Blue Origin-style rocket, a high-tech drone, a "Billionaire Blaster" handheld device, and a futuristic tablet. Emphasize a heroic pose and an overall playful, collector\'s item aesthetic.',
            toolLink: '/action-figure-ai'
        },
        {
            originals: ["/examples/action-figure/original-3.jpg"],
            generated: "/examples/action-figure/action-figure-3.png",
            prompt: 'Transform the uploaded photo into a full-body action figure toy rendered in a clean, cartoonish 3D style with an original blister pack packaging featuring bold blue and yellow accents, the title "TECHNOKING ELON" and the tagline "One Tweet Away from Mars!", including detailed accessories such as a miniature Cybertruck, a Boring Company flamethrower, a Mars surface map, a Tesla battery pack, and an "X" control panel. Pose the figure in a confident stance wearing a black tuxedo, and maintain an overall playful, collectible-aesthetic design.',
            toolLink: '/action-figure-ai'
        },
        {
            // Example with multiple inputs - links to a specific tool
            originals: [
                "/examples/action-figure/original-4.jpg",
            ],
            generated: "/examples/action-figure/action-figure-4.png",
            prompt: 'Transform the uploaded photo into a full-body action figure toy rendered in a clean, cartoonish 3D style with an original blister pack packaging featuring teal and magenta accents. Use the title "GATES OF GENIUS" and the tagline "CODE. CURE. CONQUER.". Include detailed accessories such as a pair of iconic glasses, a vintage Windows monitor labeled "Windows 95", a syringe representing medical research, a philanthropic donation jar, and a chalkboard reading "How to Solve Global Warming". The figure should be posed wearing a classic dark suit with a friendly, visionary expression, maintaining a collectible, playful aesthetic overall.',
            toolLink: '/action-figure-ai'
        }
    ];

    const examplePrompts = inspirationExamples.map(example => example.prompt);

    // 提示信息数组
    const waitingTips = [
        "Creating your AI image, please don't refresh the page",
        "Processing time may vary depending on image size",
        "Our AI is carefully crafting your image",
        "Processing time varies based on server load",
        "Please wait while we work our magic..."
    ];

    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 初始化时随机选择一个示例
    useEffect(() => {
        handleRandomPrompt();
    }, [])

    // 只在用户未登录时才检查免费使用次数
    useEffect(() => {
        if (!user) {
            checkFreeUsage().then((freeUsage) => {
                console.log('Free usage:', freeUsage);
                setFreeCredits(MAX_FREE - freeUsage);
            }).catch((error) => {
                console.error('Failed to check usage:', error);
                setFreeCredits(MAX_FREE);
            });
        }
    }, [user]);

    // 加载历史记录
    useEffect(() => {
        const savedHistory = localStorage.getItem('anyimgHistory');
        if (savedHistory) {
            try {
                setHistory(JSON.parse(savedHistory));
            } catch (e) {
                console.error('Failed to parse history:', e);
            }
        }
    }, []);

    // 保存历史记录
    useEffect(() => {
        if (history.length > 0) {
            let saveSuccess = false;
            while (!saveSuccess) {
                try {
                    localStorage.setItem('anyimgHistory', JSON.stringify(history));
                    saveSuccess = true;
                } catch (e) {
                    console.error('Failed to save history,exceed the quota:', e);
                    history.shift(); // 移除最早的记录
                }
            }
        }
    }, [history]);

    // 在页面加载时恢复任务状态
    useEffect(() => {
        const savedTaskId = localStorage.getItem('pendingTaskId');
        const savedUploadedImages = localStorage.getItem('pendingUploadedImages');
        const savedSize = localStorage.getItem('pendingSize');

        if (savedTaskId && savedUploadedImages) {
            try {
                setUploadedImages(JSON.parse(savedUploadedImages));
                if (savedSize) {
                    setSelectedSize(savedSize);
                }
                setIsGenerating(true);
                startPollingTaskStatus(savedTaskId);
            } catch (e) {
                console.error('Failed to parse saved uploaded images:', e);
            }
        }
    }, []);

    // 添加轮动提示的effect
    useEffect(() => {
        if (isGenerating) {
            // 清除之前的interval
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
            }

            // 设置新的interval
            const intervalId = setInterval(() => {
                setCurrentTipIndex(prev => (prev + 1) % waitingTips.length);
            }, 5000);

            tipIntervalRef.current = intervalId;
        } else {
            // 停止轮动
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
                tipIntervalRef.current = null;
            }
        }

        // 清理函数
        return () => {
            if (tipIntervalRef.current) {
                clearInterval(tipIntervalRef.current);
            }
        };
    }, [isGenerating]);

    const handleRandomPrompt = () => {
        const randomIndex = Math.floor(Math.random() * examplePrompts.length);
        setPrompt(examplePrompts[randomIndex]);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setImageUploading(true);
        try {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            // Limit to 5 images maximum
            const filesToProcess = Math.min(files.length, MAX_IMAGES - uploadedImages.length);

            // For free users, show upgrade modal if trying to upload multiple files
            if (!user && (files.length > 1 || uploadedImages.length >= FREE_MAX_IMAGES)) {
                setShowUpgradeModal(true);
                setImageUploading(false);
                return;
            }

            // Process each file (up to the limit)
            for (let i = 0; i < filesToProcess; i++) {
                const file = files[i];

                // Check file type
                if (!file.type.startsWith('image/')) {
                    alert('Please upload image files only');
                    continue;
                }

                // Check file size (5MB limit)
                if (file.size > 5 * 1024 * 1024) {
                    alert('Image size should be less than 5MB');
                    continue;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    if (event.target?.result) {
                        const img = document.createElement('img');
                        img.crossOrigin = 'anonymous'; // Handle cross-origin issues
                        img.onload = () => {
                            let width = img.width;
                            let height = img.height;

                            // Resize large images proportionally
                            if (width > 1024) {
                                height = Math.round((height * 1024) / width);
                                width = 1024;
                            }

                            // Create canvas to resize and compress the image
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, width, height);
                                // Convert to WebP format
                                const webpImage = canvas.toDataURL('image/webp');
                                // Add to uploaded images array
                                setUploadedImages(prev => [...prev, webpImage]);
                            }
                            canvas.remove();
                            img.remove();
                        };
                        img.src = event.target.result as string;
                    }
                };
                reader.readAsDataURL(file);
            }

            // Clear generated images when new images are uploaded
            setGeneratedImages([]);
        } finally {
            setImageUploading(false);
        }
    };

    const removeUploadedImage = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setUploadedImages(prev => {
            const newImages = [...prev];
            newImages.splice(index, 1);
            return newImages;
        });

        // 如果移除了所有图片，清空生成的图片结果
        if (uploadedImages.length <= 1) {
            setGeneratedImages([]);
        }

        // 清除文件输入框的值，避免相同文件不触发onChange事件
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAllImages = () => {
        setUploadedImages([]);
        setGeneratedImages([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleTurnstileSuccess = (token: string) => {
        if (token) {
            executeGeneration(token);
        }
    };

    const handleGenerateClick = async () => {
        if (uploadedImages.length === 0) {
            alert('Please upload at least one image');
            return;
        }

        // Determine logic based on login status
        if ((!user && freeCredits <= 0) || (user && credits <= 0)) {
            // For non-logged in users with no free credits, or logged in users with no credits, show upgrade modal
            setShowUpgradeModal(true);
            return;
        }

        // Users with remaining credits can continue generating
        setShowTurnstile(true);
        setPendingGeneration(true);
    };

    const executeGeneration = async (token: string) => {
        if (uploadedImages.length === 0) return;

        setIsGenerating(true);
        setGenerationError('');
        setShowTurnstile(false);
        setPendingGeneration(false);

        try {
            const accessToken = await getAccessToken();

            const response = await fetch('/api/generate-image/create-task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    images: uploadedImages,
                    prompt: prompt,
                    size: selectedSize, // Add size parameter
                    turnstileToken: token,
                    accessToken
                })
            });

            if (response.ok) {
                useOnce(); // Deduct credit points
                const responseData = await response.json();

                // Save task ID and uploaded images to localStorage
                localStorage.setItem('pendingTaskId', responseData.taskId);
                localStorage.setItem('pendingUploadedImages', JSON.stringify(uploadedImages));
                localStorage.setItem('pendingPrompt', prompt);
                localStorage.setItem('pendingSize', selectedSize); // Save size parameter
                startPollingTaskStatus(responseData.taskId);
            } else {
                const errorData = await response.json();
                taskFailed(errorData.error || 'Failed to create generation task');
            }
        } catch (error) {
            console.error('Error starting generation task:', error);
            taskFailed('Error occurred while creating generation task');
        }
    };

    // 开始轮询任务状态
    const startPollingTaskStatus = (taskId: string) => {
        // 清除之前的轮询
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
        }

        // 设置新的轮询间隔
        const intervalId = setInterval(() => {
            checkTaskStatus(taskId);
        }, CHECK_STATUS_INTERVAL); // 每分钟检查一次

        // 直接更新ref，不使用状态更新
        pollingIntervalRef.current = intervalId;
    };

    // 检查任务状态
    const checkTaskStatus = async (taskId: string) => {
        console.log(`Checking task ${taskId} status)`);
        try {
            const response = await fetch(`/api/generate-image/task-status?taskId=${taskId}`);

            if (response.ok) {
                const data = await response.json();
                console.log(`Check task ${taskId} status, response: ${JSON.stringify(data)}`);

                if (data.status === 'SUCCESS') {
                    // Process multiple generated images
                    const generatedImagesData = data.generatedImages || [];
                    if (generatedImagesData.length > 0) {
                        processGeneratedImages(generatedImagesData);
                    } else if (data.generatedImage) {
                        // Compatibility with old API that returns a single image
                        processGeneratedImages([data.generatedImage]);
                    } else {
                        taskFailed('Returned image data format error');
                    }
                } else if (data.status === 'GENERATING') {
                    // Still generating, continue polling
                } else {
                    // Generation failed or other status
                    taskFailed(data.message || 'Image generation failed');
                }
            } else {
                // API request failed
                taskFailed('Failed to check task status');
            }
        } catch (error) {
            taskFailed(`Error checking task status: ${error}`);
        }
    };

    // 处理生成的多张图片
    const processGeneratedImages = (imageUrls: string[]) => {
        // Always take the first image URL as the generated image
        const imageUrl = imageUrls[0];
        if (!imageUrl) {
            taskFailed('No generated image received');
            return;
        }

        // Create image element to process the image
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            if (ctx) {
                ctx.drawImage(img, 0, 0, img.width, img.height);
                const img_base64 = canvas.toDataURL('image/jpeg');

                // Set the generated image
                setGeneratedImages([img_base64]);

                // Get the current uploaded images and prompt
                let currentUploadedImages: string[] = [];
                try {
                    const savedImages = localStorage.getItem('pendingUploadedImages');
                    if (savedImages) {
                        currentUploadedImages = JSON.parse(savedImages);
                    } else {
                        currentUploadedImages = uploadedImages;
                    }
                } catch (e) {
                    console.error('Error parsing saved uploaded images:', e);
                    currentUploadedImages = uploadedImages;
                }

                const currentPrompt = localStorage.getItem('pendingPrompt') || prompt;

                // Add to history
                addToHistory(currentUploadedImages, img_base64, currentPrompt);

                // Complete processing
                stopPolling();
                setIsGenerating(false);

                // Clear localStorage temp data
                localStorage.removeItem('pendingTaskId');
                localStorage.removeItem('pendingUploadedImages');
                localStorage.removeItem('pendingPrompt');
                localStorage.removeItem('pendingSize');
            }

            canvas.remove();
            img.remove();
        };

        img.onerror = () => {
            console.error(`Failed to load image: ${imageUrl}`);
            stopPolling();
            setIsGenerating(false);
            taskFailed('Failed to load generated image');
        };

        img.src = imageUrl;
    };

    const taskFailed = (error: string) => {
        stopPolling();
        setIsGenerating(false);
        setGenerationError(error);
        // Clear localStorage temp data
        localStorage.removeItem('pendingTaskId');
        localStorage.removeItem('pendingUploadedImages');
        localStorage.removeItem('pendingPrompt');
        localStorage.removeItem('pendingSize');
        // Return user points
    }

    // 停止轮询
    const stopPolling = () => {
        console.log(`Stopping polling, interval is: ${pollingIntervalRef.current}`);
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setPendingGeneration(false);
    };

    const useOnce = () => {
        // Deduct points based on login status
        if (!user) {
            // For non-logged in users, deduct free credits
            setFreeCredits(prev => prev - 1);
            useOneFreeGeneration();
        } else {
            // For logged in users, credits are automatically deducted in the backend
        }
    }

    // 修改处理广告的函数
    const handleCloseAd = (isPreGenAd: boolean) => {
        if (isPreGenAd) {
            setShowPreGenAd(false);
            setPendingGeneration(false);
        } else {
            setShowPostGenAd(false);
            // Don't remove blur effect because user didn't view the ad
        }
    };

    const handleAdClick = async (isPreGenAd: boolean) => {
        // 这里可以添加实际的广告跳转逻辑
        const currentWindow = window
        const newTab = window.open('https://povaique.top/4/9150862', '_blank', 'noopener noreferrer');
        if (newTab) {
            newTab.blur();
            currentWindow.focus();
        }

        if (isPreGenAd) {
            // 关闭生成前广告
            setShowPreGenAd(false);
            handleGenerateClick();
        } else {
            // 关闭生成后广告并移除模糊效果
            setShowPostGenAd(false);
            setIsResultBlurred(false);
            // Use first generated image when adding to history
            if (generatedImages.length > 0) {
                addToHistory(uploadedImages, generatedImages[0]);
            }
        }
    };

    const addToHistory = (originalImages: string[], generatedImage: string, promptText?: string) => {
        // Add to history record, including prompt and size
        const newHistoryItem: HistoryItem = {
            originalImages: originalImages,
            generatedImage: generatedImage,
            timestamp: Date.now(),
            prompt: promptText || undefined,
            size: selectedSize // Add size parameter
        };

        setHistory(prev => [newHistoryItem, ...prev]);
    }

    const handleImageClick = (imageSrc: string) => {
        setSelectedImage(imageSrc);
        setShowImageViewer(true);
    };

    // 清除历史记录
    const clearHistory = () => {
        if (confirm('Are you sure you want to clear all history?')) {
            setHistory([]);
            localStorage.removeItem('anyimgHistory');
        }
    };

    // 添加一个点击页面其他区域关闭下拉菜单的效果
    useEffect(() => {
        const closeDropdown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('#home-aspect-ratio-menu')) {
                const dropdown = document.getElementById('home-aspect-ratio-dropdown');
                if (dropdown && !dropdown.classList.contains('hidden')) {
                    dropdown.classList.add('hidden');
                }
            }
        };

        document.addEventListener('click', closeDropdown);

        return () => {
            document.removeEventListener('click', closeDropdown);
        };
    }, []);

    return (
        <div className="min-h-screen bg-white">
            {/* 添加升级计划提示框 */}
            {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}

            {/* 添加广告模态框 */}
            {/* {showPreGenAd && (
                <AdModal
                    onClose={() => handleCloseAd(true)}
                    onAdClick={() => handleAdClick(true)}
                    message="View an ad to generate your image for free!"
                />
            )}

            {showPostGenAd && (
                <AdModal
                    onClose={() => handleCloseAd(false)}
                    onAdClick={() => handleAdClick(false)}
                    message="View an ad to see your image in full quality!"
                />
            )} */}

            {/* 添加图片查看器 */}
            {showImageViewer && selectedImage && (
                <ImageViewerModal
                    imageSrc={selectedImage}
                    onClose={() => setShowImageViewer(false)}
                />
            )}

            {/* 添加Turnstile验证模态框 */}
            {showTurnstile && (
                <TurnstileModal
                    onSuccess={handleTurnstileSuccess}
                    onClose={() => {
                        setShowTurnstile(false);
                        setPendingGeneration(false);
                    }}
                />
            )}

            {/* 登录提示模态框 */}
            {showLoginPrompt && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-xl max-w-md w-full">
                        <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Login Required</h3>
                        <p className="text-[#506a3a] mb-6">
                            Free users can only upload 1 image. Upgrade to premium to upload up to 5 images for processing.
                        </p>
                        <div className="flex gap-4 justify-end">
                            <button
                                className="px-4 py-2 bg-gray-200 rounded-lg text-gray-800 hover:bg-gray-300"
                                onClick={() => setShowLoginPrompt(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 bg-[#1c4c3b] text-white rounded-lg hover:bg-[#2a6854]"
                                onClick={() => {
                                    setShowLoginPrompt(false);
                                    setLoginModalRedirectTo(window.location.href);
                                    setIsLoginModalOpen(true);
                                }}
                            >
                                Login/Register
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="pt-8">
                {/* Hot tools section - much smaller design with horizontal layout */}
                <section className="container mx-auto px-3 mb-5">
                    <div className="bg-gradient-to-r from-[#ff6b6b] to-[#ffb347] p-3 rounded-lg">
                        <h2 className="text-lg font-bold mb-3 text-white text-center">🔥 Popular AI Tools 🔥</h2>
                        <div className="flex flex-wrap justify-around gap-6">
                            {hotTools.map(tool => (
                                <a
                                    key={tool.id}
                                    href={tool.url}
                                    className="bg-white/90 rounded-lg shadow-sm hover:shadow-md transition transform hover:-translate-y-0.5 flex items-center relative w-64 h-20 p-2"
                                >
                                    {/* Hot indicator in top right */}
                                    {tool.isHot && (
                                        <div className="absolute top-0 right-0 transform translate-x-1 -translate-y-1">
                                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M10 2C8.68678 2 7.5 2.93542 7.5 4.16667C7.5 5.35677 7.62537 6.39044 6.66667 7.08333C5.70796 7.77622 4.55695 7.08333 3.33333 7.08333C2.04584 7.08333 1 8.01772 1 9.16667C1 10.3156 1.80416 11.25 2.91667 11.25C3.06215 11.25 3.09711 11.2537 3.29138 11.2962C3.61461 11.3638 3.75 11.5758 3.75 11.9167C3.75 12.4171 3.57739 12.607 3.44258 12.7293C3.30966 12.8508 3.17379 12.9553 3.05916 13.0699C2.82812 13.3014 2.65239 13.547 2.55254 13.843C2.4538 14.1359 2.42699 14.4805 2.5 14.9167C2.63636 15.8345 3.40136 16.6667 4.58333 16.6667C5.67208 16.6667 6.26491 16.2212 6.73382 15.6936C7.23393 15.1379 7.52315 14.3382 7.94458 13.5038C8.13077 13.1196 8.3326 12.7214 8.57037 12.375C8.83576 11.9963 9.11905 11.6731 9.58333 11.6667C10.0476 11.6602 10.331 11.9833 10.5964 12.3621C10.8342 12.7084 11.0361 13.1067 11.2222 13.4909C11.6437 14.3252 11.9329 15.125 12.433 15.6807C12.9019 16.2083 13.4948 16.6538 14.5833 16.6538C15.7653 16.6538 16.5303 15.8216 16.6667 14.9038C16.7397 14.4676 16.7129 14.123 16.6141 13.8301C16.5143 13.5341 16.3385 13.2885 16.1075 13.0569C15.9929 12.9424 15.857 12.8379 15.7241 12.7164C15.5892 12.5941 15.4167 12.4042 15.4167 11.9038C15.4167 11.5628 15.552 11.3509 15.8753 11.2833C16.0696 11.2407 16.1045 11.2371 16.25 11.2371C17.3625 11.2371 18.1667 10.3027 18.1667 9.15375C18.1667 8.00481 17.1208 7.07042 15.8333 7.07042C14.6097 7.07042 13.4587 7.7633 12.5 7.07042C11.5413 6.37753 11.6667 5.34386 11.6667 4.15375C11.6667 2.92251 10.4799 1.98709 9.16667 1.98709" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                    )}

                                    {/* Tool icon on left */}
                                    <div className="w-16 h-16 flex-shrink-0 mr-1">
                                        <img
                                            src={tool.logo}
                                            alt={`${tool.name} logo`}
                                            className="w-full h-full object-contain"
                                        />
                                    </div>

                                    {/* Tool info on right */}
                                    <div className="flex flex-col justify-center text-left overflow-hidden">
                                        <h3 className="font-bold text-sm text-[#1c4c3b] truncate">{tool.name}</h3>
                                        <p className="text-xs text-[#506a3a] line-clamp-2">{tool.description}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                </section>

                {/* 英雄区域 */}
                <div id="hero_containter" className='w-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12'>
                    <section className="w-full md:max-w-auto container mx-auto px-4 py-8 text-center">
                        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-[#1c4c3b]">AI Image Generator</h1>
                        <p className="text-xl md:text-2xl text-[#506a3a] mb-6 max-w-3xl mx-auto">
                            Transform your photos into multiple artistic styles with one click
                        </p>
                        <p className="text-md text-[#506a3a] mb-12 max-w-3xl mx-auto">
                            Powered by ChatGPT | Advanced AI image generation technology for high-quality personalized art
                        </p>

                        {/* 工具区域 */}
                        <div className="bg-[#e7f0dc] p-6 rounded-xl max-w-5xl mx-auto shadow-lg border border-[#89aa7b]" id="tool-section">
                            <h2 className="text-2xl font-bold mb-6 text-[#1c4c3b]">AI Image Generator</h2>

                            {/* 上传图片区域 */}
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <label htmlFor="upload-image-input" className="block text-[#1c4c3b] font-medium text-left">
                                        Upload Images ({uploadedImages.length}/{MAX_IMAGES})
                                    </label>
                                    {uploadedImages.length > 0 && (
                                        <button
                                            onClick={removeAllImages}
                                            className="text-sm text-[#1c4c3b] hover:underline"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>

                                <div
                                    className={`p-4 border-2 border-dashed border-[#89aa7b] rounded-lg bg-white/90 text-center cursor-pointer`}
                                    onClick={triggerFileInput}
                                >
                                    <input
                                        id='upload-image-input'
                                        type="file"
                                        accept="image/*"
                                        multiple={true}
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        title="Upload image"
                                        aria-label="Upload image"
                                    />

                                    {uploadedImages.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                            {uploadedImages.map((img, index) => (
                                                <div key={index} className="relative h-24 bg-gray-50">
                                                    <img
                                                        src={img}
                                                        alt={`Uploaded image ${index + 1}`}
                                                        className="h-full w-full object-contain rounded-lg"
                                                    />
                                                    <div className="absolute bottom-1 right-1">
                                                        <button
                                                            className="bg-white/80 p-1 rounded-full text-[#1c4c3b] hover:bg-white transition"
                                                            onClick={(e) => removeUploadedImage(index, e)}
                                                            title="Remove uploaded image"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Centered upload button in remaining space */}
                                            {uploadedImages.length < MAX_IMAGES && (
                                                <div
                                                    className={`col-span-${Math.min(MAX_IMAGES - uploadedImages.length, 2)} sm:col-span-${Math.min(MAX_IMAGES - uploadedImages.length, 3)} md:col-span-${Math.min(MAX_IMAGES - uploadedImages.length, 5)} flex justify-center items-center`}
                                                >
                                                    <div
                                                        className="flex flex-col items-center justify-center cursor-pointer h-full"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!user && uploadedImages.length >= FREE_MAX_IMAGES) {
                                                                setShowUpgradeModal(true);
                                                            } else {
                                                                triggerFileInput();
                                                            }
                                                        }}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#89aa7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        <p className="text-sm text-[#506a3a] mt-2">Click to upload</p>
                                                        <p className="text-xs text-red-500 mt-1">Maximum 5 images</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#89aa7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="mt-4 text-[#506a3a]">Click to upload images or drag & drop</p>
                                            <p className="text-sm text-[#506a3a] mt-1">PNG, JPG, WEBP up to 5MB</p>
                                            <p className="text-sm text-red-500 font-semibold mt-1">Maximum 5 images</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 提示词输入框 */}
                            <div className="mb-6">
                                <label htmlFor="prompt-input" className="block text-[#1c4c3b] font-medium mb-2 text-left">Enter your prompt</label>
                                <div className="flex gap-2">
                                    <textarea
                                        id="prompt-input"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Describe the image style you want..."
                                        className="w-full p-3 border border-[#89aa7b] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c4c3b] min-h-[80px] resize-y"
                                    ></textarea>
                                    <div className="flex flex-col gap-2 w-48">
                                        <button
                                            onClick={() => {
                                                const examplesSection = document.getElementById('examples');
                                                if (examplesSection) {
                                                    examplesSection.scrollIntoView({ behavior: 'smooth' });
                                                }
                                            }}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-[#89aa7b] text-white rounded-lg hover:bg-[#6d8c60] transition"
                                            title="Get inspiration from examples"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            <span className="text-sm">Get Inspiration</span>
                                        </button>
                                        <button
                                            onClick={handleRandomPrompt}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-[#89aa7b] text-white rounded-lg hover:bg-[#6d8c60] transition"
                                            title="Get a random prompt"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            <span className="text-sm">Random</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                const howToUseSection = document.getElementById('how-to-use');
                                                if (howToUseSection) {
                                                    howToUseSection.scrollIntoView({ behavior: 'smooth' });
                                                }
                                            }}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-[#89aa7b] text-white rounded-lg hover:bg-[#6d8c60] transition"
                                            title="Learn how to use this tool"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-sm">How to Use</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Image Size selection */}
                            <div className="mb-6">
                                <label className="block text-[#1c4c3b] font-medium mb-2 text-left">Select Output Aspect Ratio</label>
                                <div className="flex items-center mb-4">
                                    <div className="relative inline-block text-left">
                                        <div>
                                            <button
                                                type="button"
                                                className="inline-flex justify-between items-center w-36 rounded-md border border-[#89aa7b] px-2 py-1 bg-white text-sm font-medium text-[#1c4c3b] hover:bg-[#f8fbf3] focus:outline-none"
                                                id="home-aspect-ratio-menu"
                                                aria-expanded="true"
                                                aria-haspopup="true"
                                                onClick={() => {
                                                    const dropdown = document.getElementById('home-aspect-ratio-dropdown');
                                                    if (dropdown) {
                                                        dropdown.classList.toggle('hidden');
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center">
                                                    {selectedSize === '1:1' && (
                                                        <div className="w-5 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                            <div className="w-3 h-3 bg-[#89aa7b]"></div>
                                                        </div>
                                                    )}
                                                    {selectedSize === '3:2' && (
                                                        <div className="w-6 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                            <div className="w-4 h-3 bg-[#89aa7b]"></div>
                                                        </div>
                                                    )}
                                                    {selectedSize === '2:3' && (
                                                        <div className="w-5 h-6 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                            <div className="w-3 h-4 bg-[#89aa7b]"></div>
                                                        </div>
                                                    )}
                                                    <span>{selectedSize}</span>
                                                </div>
                                                <svg className="-mr-1 ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                        <div
                                            id="home-aspect-ratio-dropdown"
                                            className="hidden origin-top-left absolute left-0 mt-2 w-36 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                                            role="menu"
                                            aria-orientation="vertical"
                                            aria-labelledby="home-aspect-ratio-menu"
                                        >
                                            <div className="py-1" role="none">
                                                <button
                                                    className={`${selectedSize === '1:1' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setSelectedSize('1:1');
                                                        document.getElementById('home-aspect-ratio-dropdown')?.classList.add('hidden');
                                                    }}
                                                >
                                                    <div className="w-5 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-3 h-3 bg-[#89aa7b]"></div>
                                                    </div>
                                                    <span>1:1</span>
                                                </button>
                                                <button
                                                    className={`${selectedSize === '3:2' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setSelectedSize('3:2');
                                                        document.getElementById('home-aspect-ratio-dropdown')?.classList.add('hidden');
                                                    }}
                                                >
                                                    <div className="w-6 h-5 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-4 h-3 bg-[#89aa7b]"></div>
                                                    </div>
                                                    <span>3:2</span>
                                                </button>
                                                <button
                                                    className={`${selectedSize === '2:3' ? 'bg-[#e7f0dc] text-[#1c4c3b]' : 'text-[#506a3a]'} flex items-center px-4 py-2 text-sm w-full text-left hover:bg-[#f8fbf3]`}
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setSelectedSize('2:3');
                                                        document.getElementById('home-aspect-ratio-dropdown')?.classList.add('hidden');
                                                    }}
                                                >
                                                    <div className="w-5 h-6 bg-[#d5e6c3] flex items-center justify-center mr-2 border border-[#89aa7b]">
                                                        <div className="w-3 h-4 bg-[#89aa7b]"></div>
                                                    </div>
                                                    <span>2:3</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 按钮区域 */}
                            <div className="flex flex-col justify-center mb-6 gap-2">
                                <button
                                    className={`w-auto px-6 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition ${isGenerating || uploadedImages.length === 0 || pendingGeneration ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                    onClick={handleGenerateClick}
                                    disabled={isGenerating || uploadedImages.length === 0 || pendingGeneration}
                                >
                                    {isGenerating ? 'Generating...' : pendingGeneration ? 'Verifying...' : 'Generate Image'}
                                </button>

                                {/* 只在未登录状态下显示免费点数提示 */}
                                {!user && (
                                    <p className="ml-4 text-sm text-[#506a3a]">Remaining Free Credits: {freeCredits} &nbsp;&nbsp;
                                        <button
                                            onClick={() => {
                                                setLoginModalRedirectTo(`${window.location.origin}/temp-purchase`)
                                                setIsLoginModalOpen(true); // 打开登录模态框
                                                setIsLoginModalOpen(true); // Open login modal
                                            }}
                                            className="text-[#1c4c3b] font-medium underline"
                                        >
                                            Buy Credits
                                        </button>
                                    </p>
                                )}
                            </div>

                            <p className="text-sm text-[#506a3a] mt-4">
                                Powered by <span className="font-semibold">ChatGPT technology</span> | Fast, accurate AI image generation
                            </p>
                        </div>
                    </section>
                </div>

                {/* 生成结果区域 */}
                {(isGenerating || generatedImages.length > 0 || generationError) && (
                    <section className="container mx-auto px-4 py-8">
                        <h2 className="text-2xl font-bold mb-6 text-center text-[#1c4c3b]">Your AI Image Results</h2>

                        {isGenerating && (
                            <div className="flex justify-center items-center p-12">
                                <div className="relative inline-flex">
                                    <div className="w-16 h-16 border-4 border-[#e7f0dc] border-t-[#1c4c3b] rounded-full animate-spin"></div>
                                    <span className="sr-only">Loading...</span>
                                </div>
                                <div className="ml-4">
                                    <p className="text-lg text-[#1c4c3b]">{waitingTips[currentTipIndex]}</p>
                                </div>
                            </div>
                        )}

                        {generationError && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center text-red-700 mb-6">
                                {generationError}
                            </div>
                        )}

                        {generatedImages.length > 0 && uploadedImages.length > 0 && !isGenerating && (
                            <div className="max-w-5xl mx-auto">
                                {/* 添加模糊效果覆盖层 */}
                                {isResultBlurred && (
                                    <div className="absolute inset-0 backdrop-blur-md z-10 flex flex-col items-center justify-center gap-2">
                                        <div className="p-4 bg-white/70 rounded-lg shadow-lg">
                                            <p className="text-lg font-medium text-[#1c4c3b]">Your AI image is ready!</p>
                                        </div>
                                        <button
                                            className="bg-[#1c4c3b] text-white p-3 text-sm rounded-lg hover:bg-[#2a6854] transition"
                                            onClick={() => setShowPostGenAd(true)}
                                        >
                                            Reveal Your Image
                                        </button>
                                    </div>
                                )}

                                {/* 单张图片的对比显示 */}
                                <div className="rounded-lg overflow-hidden shadow-md border border-[#89aa7b]">
                                    <div className="relative">
                                        <div className="flex flex-col md:flex-row">
                                            <div className="w-full md:w-1/2 p-2">
                                                <div className="aspect-w-16 aspect-h-9 relative">
                                                    <img
                                                        src={uploadedImages[0]}
                                                        alt="Original image"
                                                        className="w-full h-full object-contain rounded-lg"
                                                        onClick={() => handleImageClick(uploadedImages[0])}
                                                    />
                                                    <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-xs text-[#1c4c3b]">
                                                        Original
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-full md:w-1/2 p-2">
                                                <div className="aspect-w-16 aspect-h-9 relative">
                                                    <img
                                                        src={generatedImages[0]}
                                                        alt="Generated image"
                                                        className="w-full h-full object-contain rounded-lg"
                                                        onClick={() => handleImageClick(generatedImages[0])}
                                                    />
                                                    <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-xs text-[#1c4c3b]">
                                                        AI Generated
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {prompt && (
                                        <div className="p-4 bg-white">
                                            <p className="text-sm text-[#506a3a]"><strong>Prompt:</strong> <span className="italic">{prompt}</span></p>
                                        </div>
                                    )}
                                </div>

                                {/* 下载/分享按钮 */}
                                <div className="flex justify-center mt-6 gap-4">
                                    <button
                                        className="px-4 py-2 bg-[#1c4c3b] text-white rounded-lg hover:bg-[#2a6854] flex items-center gap-2"
                                        onClick={() => {
                                            if (generatedImages.length > 0) {
                                                const a = document.createElement('a');
                                                a.href = generatedImages[0];
                                                a.download = `anyimg-generation-${Date.now()}.png`;
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                            }
                                        }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Download Image
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* 历史记录区域 */}
                {/* 历史记录区域 - 更新展示内容 */}
                {history && (
                    <section className="container mx-auto px-4 py-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-[#1c4c3b]">Your Action Figure AI Gallery</h2>
                            <button
                                onClick={clearHistory}
                                className="px-3 py-1 text-sm border border-[#89aa7b] rounded-lg hover:bg-[#d5e6c3] transition text-[#506a3a]"
                            >
                                Clear History
                            </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {history.map((item, index) => (
                                <div className="relative">
                                    <ImageComparisonCard
                                        id={`history-image-comparison-card-${index}`}
                                        data-type="history-image-comparison-card"
                                        original={item.originalImages[0]}
                                        generate={item.generatedImage}
                                        tags={[
                                            ['Prompt', item.prompt]
                                        ]}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 示例区域 */}
                <section id="examples" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">AI Image Inspiration Gallery</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center">
                        Check out these examples and use their prompts to create your own AI images
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                        {inspirationExamples.map((example, index) => (
                            <div key={index} className="rounded-lg overflow-hidden shadow-md hover:shadow-xl transition border border-[#89aa7b]">
                                {/* Always use 2-column layout for example cards */}
                                <div className="grid grid-cols-2 gap-2 p-3">
                                    {/* Left side - input images or empty */}
                                    <div className="col-span-1">
                                        {example.originals &&
                                            <div>
                                                <p className="text-[#1c4c3b] font-medium mb-2 text-center">Original{example.originals.length > 1 ? 's' : ''}</p>
                                                <div className={`grid ${example.originals.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                                                    {example.originals.map((original, origIndex) => (
                                                        <div key={`orig-${origIndex}`} className="aspect-w-1 aspect-h-1">
                                                            <img
                                                                src={original}
                                                                alt={`Example original ${index}-${origIndex}`}
                                                                className="w-full h-full object-cover rounded-lg"
                                                                onClick={() => handleImageClick(original)}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        }
                                    </div>

                                    {/* Right side - generated image */}
                                    <div className="col-span-1">
                                        <p className="text-[#1c4c3b] font-medium mb-2 text-center">AI Generated</p>
                                        <div className="flex justify-center items-center h-full">
                                            <div className="aspect-w-1 aspect-h-1 w-full">
                                                <img
                                                    src={example.generated}
                                                    alt={`Example generated ${index}`}
                                                    className="w-full h-full object-cover rounded-lg"
                                                    onClick={() => handleImageClick(example.generated)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-white">
                                    <div className="flex justify-between items-center gap-2">
                                        {/* Show prompt for general examples, or tool message for tool-specific examples */}
                                        {example.prompt ? (
                                            <p className="text-sm text-[#506a3a] flex-1"><strong>Prompt:</strong> <span className="italic">{example.prompt}</span></p>
                                        ) : (
                                            <p className="text-sm text-[#506a3a] flex-1">Try this style with our dedicated tool</p>
                                        )}

                                        {/* Show Apply button for prompt examples, or Explore button for tool links */}
                                        {example.toolLink ? (
                                            <a
                                                href={example.toolLink || "#"}
                                                className="flex-shrink-0 p-2 bg-[#1c4c3b] text-white rounded-lg hover:bg-[#2a6854] transition flex items-center gap-1"
                                                title="Explore this tool"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                </svg>
                                                <span className="text-xs">Explore</span>
                                            </a>
                                        ) : (
                                            <button
                                                className="flex-shrink-0 p-2 bg-[#e7f0dc] text-[#1c4c3b] rounded-lg hover:bg-[#d5e6c3] transition flex items-center gap-1"
                                                onClick={() => {
                                                    setPrompt(example.prompt || "");
                                                    const toolSection = document.getElementById('tool-section');
                                                    if (toolSection) {
                                                        toolSection.scrollIntoView({ behavior: 'smooth' });
                                                    }
                                                }}
                                                title="Use this prompt"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                                </svg>
                                                <span className="text-xs">Apply</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 详细使用指南部分 - MOVED HERE */}
                <section id="how-to-use" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">How to Use Our AI Image Generator</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Follow these detailed steps to create your perfect AI image with our AI image generator
                    </p>

                    <div className="max-w-4xl mx-auto">
                        <div className="grid gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">1</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Upload Your Image to Our AI Image Generator</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Click on the upload area at the top of the AI image generator tool section. You can either drag and drop an image or click to browse your files.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            For best results with our AI image generator, choose a clear photo with good lighting where your face and body are clearly visible. Front-facing portraits work best for AI image transformations.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Supported formats include JPG, PNG, and WEBP, with a maximum file size of 5MB.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">2</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Enter Your Prompt for the AI Image Generator</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            If you already know what kind of image style you want, type your description directly in the prompt box. Be as specific as possible about the style, accessories, and details you'd like in your AI image creation.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Example: "Transform into a sci-fi bounty hunter image with battle-worn armor, laser rifle, and desert planet base."
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">3</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Get Inspiration for Your AI Image Design</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            If you're not sure what prompt to use for our AI image generator, click the "Get Inspiration" button to browse our Inspiration Gallery. There you'll find many examples of AI image transformations with different styles and themes.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            When you find a style you like, simply click the "Apply" button next to the prompt. This will automatically copy the prompt to your input box and return you to the AI image generator tool section.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Alternatively, you can click the "Random" button to get a randomly selected prompt from our collection of effective AI image examples.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">4</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Customize Your AI Image Prompt</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Once you have a base prompt for our AI image generator (either from the gallery or your own), personalize it by modifying specific elements:
                                        </p>
                                        <ul className="list-disc pl-5 mb-3 space-y-2 text-[#506a3a]">
                                            <li><strong>Name:</strong> Change any character name to your own name or a character name you prefer in your AI image creation</li>
                                            <li><strong>Headline:</strong> Modify the title or description (e.g., "Galactic Warrior" to "Space Explorer")</li>
                                            <li><strong>Accessories:</strong> Update the accessories to match your interests (e.g., "sword" to "magic staff") for a personalized AI image</li>
                                            <li><strong>Style:</strong> Adjust the overall aesthetic (e.g., "modern" to "vintage 80s") for your custom AI image style</li>
                                            <li><strong>Packaging:</strong> Specify if you want packaging details (e.g., "with display case" or "in blister pack") for your AI image generator result</li>
                                        </ul>
                                        <p className="text-[#506a3a]">
                                            The more specific and personal your prompt, the more unique your AI image creation will be!
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">5</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Generate Your AI Image with AI</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Once you're satisfied with your image and prompt, click the "Generate Image" button to submit your generation task to our AI image generator.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            The AI image generation process typically takes a few moments. During this time, you'll see a loading indicator - please be patient and do not refresh the page while the AI image generator is working.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Congratulations! Your personalized AI image creation will appear shortly. From there, you can view the before/after comparison and save your AI image masterpiece.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 新增 AI 行动人偶革命部分 */}
                <section className="container mx-auto px-4 py-16 bg-[#f9fbf6]">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Exploring the AI Image Revolution</h2>
                        <p className="text-xl text-[#506a3a] mb-6">
                            The AI image trend has become incredibly popular for collectors, hobbyists, and anyone who wants to see themselves transformed into a miniature collectible masterpiece. Our advanced AI image generator uses cutting-edge technology to create stunningly detailed and personalized figures.
                        </p>

                        <div className="grid md:grid-cols-2 gap-8 mb-10">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">What Makes AI Image Special</h3>
                                <ul className="list-disc pl-5 space-y-2 text-[#506a3a]">
                                    <li>Hyper-realistic detailing that mimics commercial-quality AI images</li>
                                    <li>Perfect joint articulation points characteristic of collectible figures</li>
                                    <li>Custom packaging design that resembles authentic toy packaging</li>
                                    <li>Personalized character design based on your specific prompts</li>
                                    <li>Multiple style options from retro 80s to modern high-detail figures</li>
                                </ul>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Why Use Our AI Image Maker</h3>
                                <ul className="list-disc pl-5 space-y-2 text-[#506a3a]">
                                    <li>Most advanced AI image technology on the market</li>
                                    <li>Simple upload-and-generate process with fast results</li>
                                    <li>High-resolution output perfect for social media sharing</li>
                                    <li>Extensive prompt library for inspiration</li>
                                    <li>Creates unique collectible-style figures that preserve your likeness</li>
                                </ul>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b] mb-8">
                            <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Popular AI Image Styles</h3>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Superhero</h4>
                                    <p className="text-sm text-[#506a3a]">Marvel/DC inspired figures with dynamic poses and vibrant costumes</p>
                                </div>
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Sci-Fi</h4>
                                    <p className="text-sm text-[#506a3a]">Space explorers, alien hunters and futuristic warriors with high-tech gear</p>
                                </div>
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Fantasy</h4>
                                    <p className="text-sm text-[#506a3a]">Medieval knights, wizards and mythical creatures with magical accessories</p>
                                </div>
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Vintage</h4>
                                    <p className="text-sm text-[#506a3a]">Retro 70s-90s style figures with authentic period-appropriate details</p>
                                </div>
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Military</h4>
                                    <p className="text-sm text-[#506a3a]">Tactical combat figures with realistic gear and accessories</p>
                                </div>
                                <div className="p-3 bg-[#e7f0dc] rounded-lg">
                                    <h4 className="font-bold text-[#1c4c3b] mb-1">Movie Characters</h4>
                                    <p className="text-sm text-[#506a3a]">Classic film-inspired figures with iconic costume elements</p>
                                </div>
                            </div>
                        </div>

                        <p className="text-center text-[#506a3a]">
                            Our AI image generator is continuously improving with new features and styles. Try it today to see yourself transformed into a stunning collectible figure!
                        </p>
                    </div>
                </section>

                {/* FAQ 部分 - 增加SEO关键词 */}
                <section id="faq" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Frequently Asked Questions About AI Image</h2>

                    <div className="max-w-4xl mx-auto">
                        <div className="space-y-4">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">What exactly is an AI image generator?</h3>
                                <p className="text-[#506a3a]">
                                    An AI image generator is a specialized artificial intelligence tool that transforms regular photos into images that look like commercial AI images. Our AI image maker analyzes your photo and creates a highly detailed figure complete with articulation points, accessories, and even packaging style elements typical of collectible AI images.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">How realistic do the AI images from your AI image maker look?</h3>
                                <p className="text-[#506a3a]">
                                    Our AI image creates impressively realistic results that mimic commercial-quality AI images. The AI generates detailed textures, joint articulations, and accessories that make the figures look like they could be photographed on a store shelf. The quality depends somewhat on your original photo quality and the specificity of your prompt.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">Can I create AI images based on specific toy lines with your AI image?</h3>
                                <p className="text-[#506a3a]">
                                    Yes! Our AI image generator can create figures inspired by popular toy styles from different eras. You can specify styles like "80s GI Joe style," "modern Marvel Legends style," or "Japanese mecha style" in your prompts to guide the AI image toward a particular aesthetic. The more specific your description, the better the AI can match your desired style.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">How many free credits do I get with the AI image maker?</h3>
                                <p className="text-[#506a3a]">
                                    New users receive 3 free credits to try our AI image generator. Each credit allows you to create one AI image. After using your free credits, you can purchase additional credits or subscribe to our premium plan for unlimited access to our AI image maker and other AI transformation tools.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">Can I use the AI image images commercially?</h3>
                                <p className="text-[#506a3a]">
                                    Yes, all images created with our AI image maker are yours to use, including for commercial purposes. However, please be aware that if your prompts reference specific trademarked characters or brands, the resulting images may have copyright implications that you should consider before commercial use.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 创作者声明部分 */}
                <section className="container mx-auto px-4 py-16 bg-[#f9fbf6]">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl font-bold mb-8 text-[#1c4c3b]">Create Your Personalized AI Image Today</h2>
                        <p className="text-xl text-[#506a3a] mb-8">
                            Our AI image generator makes it easy to transform photos into incredible collectible-style figures. Whether you're creating a gift, a social media post, or just having fun, our AI image maker delivers high-quality results every time.
                        </p>
                        <button
                            onClick={() => {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-8 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition"
                        >
                            Start Creating Your AI Image
                        </button>
                    </div>
                </section>

                {/* 简化的介绍部分 */}
                <section id="about" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Explore the Unlimited Possibilities of AI Image Generation</h2>
                    <p className="text-lg text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Easily transform your photos into various artistic styles using our advanced AI technology
                    </p>

                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h3 className="text-2xl font-bold mb-4 text-[#1c4c3b]">Versatile AI Image Generator</h3>
                            <p className="text-[#506a3a] mb-4">
                                Our AI image generation technology can transform ordinary photos into multiple stunning artistic styles, including oil paintings, watercolors, sketches, anime, pixel art, and more.
                            </p>
                            <p className="text-[#506a3a] mb-4">
                                Whether you want to create personalized avatars, social media content, or add unique visual elements to your projects, our AI can meet your needs.
                            </p>
                            <p className="text-[#506a3a]">
                                With our advanced multi-image processing capability, you can process up to 5 images at once, greatly improving your creative efficiency.
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                            <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Why Choose Our AI Image Generator:</h3>
                            <ul className="space-y-3">
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">ChatGPT technology support, generating high-quality, detail-rich images</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Support for batch processing of up to 5 images, flexible and efficient</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Rich style selection to meet different creative needs</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">User-friendly interface, simple and easy to use</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Privacy protection, your images are securely encrypted</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* 使用说明部分 */}
                <section id="how-to-use" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">How to Use Our AI Image Generator</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Follow these simple steps to easily create your AI artwork
                    </p>

                    <div className="max-w-4xl mx-auto">
                        <div className="grid gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">1</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Upload Your Photos</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Click on the upload area to select photos, or drag and drop images directly. You can upload PNG, JPG, or WEBP format images, with individual files not exceeding 5MB.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Free users can upload 1 image, while registered users can upload up to 5 images for batch processing.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">2</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Enter Your Prompt</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Describe the image style and effects you want in the prompt input box. You can specify artistic style, color themes, emotional atmosphere, and more.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Example: "Transform the photo into an impressionist oil painting, using bright colors and visible brushstrokes"
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">3</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Generate Your AI Image</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Click the "Generate Image" button to start AI processing. Processing time varies depending on the number of images and complexity, typically ranging from a few seconds to a few minutes.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Once complete, you can view, download, or share your AI artwork, and continue uploading new images for more creations.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 调用行动部分 */}
                <section className="container mx-auto px-4 py-16 bg-[#f9fbf6]">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl font-bold mb-8 text-[#1c4c3b]">Start Your AI Image Creation Journey Today</h2>
                        <p className="text-xl text-[#506a3a] mb-8">
                            Our AI Image Generator makes it easy to transform ordinary photos into stunning artwork. Whether for personal creation, social media content, or commercial projects, our tool can help you.
                        </p>
                        <div className="flex flex-col md:flex-row justify-center gap-4">
                            <button
                                onClick={() => {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="px-8 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition"
                            >
                                Start Creating
                            </button>
                            {!user && (
                                <button
                                    onClick={() => {
                                        setLoginModalRedirectTo(window.location.href);
                                        setIsLoginModalOpen(true);
                                    }}
                                    className="px-8 py-3 bg-white text-[#1c4c3b] text-lg rounded-lg border-2 border-[#1c4c3b] hover:bg-[#e7f0dc] transition"
                                >
                                    Register for Premium Features
                                </button>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default HomePage; 