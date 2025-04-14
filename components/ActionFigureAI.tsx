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
import { FREE_MAX_CREDITS } from '@/config';

// 定义历史记录类型
interface HistoryItem {
    originalImages: string[];
    actionFigureImage: string;
    title?: string;
    tagline?: string;
    accessories?: string;
}


const CHECK_STATUS_INTERVAL = 60000;

// 保留waitingTips相关代码作为常量
const waitingTips = [
    "Creating your Action Figure transformation, do not refresh the page",
    "This may take a few minutes depending on image size",
    "Our AI is carefully crafting your collectible transformation",
    "Processing time varies based on server load",
    "Please wait while we work our magic..."
];

const ActionFigureAI = () => {
    // 使用AuthContext
    const { user, credits, setIsLoginModalOpen, setLoginModalRedirectTo, getAccessToken } = useAuth();

    // 将原来的prompt替换为三个新的输入
    const [title, setTitle] = useState('');
    const [tagline, setTagline] = useState('');
    const [accessories, setAccessories] = useState('');

    // 保留现有状态
    const [selectedImage, setSelectedImage] = useState('');
    const [showImageViewer, setShowImageViewer] = useState(false);
    const [uploadedImages, setUploadedImages] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState('');
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // 新增状态控制广告显示
    const [showPreGenAd, setShowPreGenAd] = useState(false);
    const [showPostGenAd, setShowPostGenAd] = useState(false);
    const [isResultBlurred, setIsResultBlurred] = useState(false);
    const [pendingGeneration, setPendingGeneration] = useState(false);
    const [showTurnstile, setShowTurnstile] = useState(false);
    const [freeCredits, setFreeCredits] = useState(0);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);

    // 将waitingTips相关状态移到组件内部
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const tipIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // 修改示例，添加title、tagline和accessories字段
    const inspirationExamples = [
        {
            original: "/examples/action-figure/original-1.webp",
            actionFigure: "/examples/action-figure/action-figure-1.webp",
            title: "CR7 STRIKEFORCE",
            tagline: "Unstoppable on Any Field!",
            accessories: "a golden soccer ball, interchangeable cleats, a Portugal jersey, a trophy stand, and signature celebration arms"
        },
        {
            original: "/examples/action-figure/original-2.webp",
            actionFigure: "/examples/action-figure/action-figure-2.webp",
            title: "BEZOS PRIME COMMANDER",
            tagline: "Delivering the Future!",
            accessories: "a miniature Blue Origin-style rocket, a high-tech drone, a 'Billionaire Blaster' handheld device, and a futuristic tablet"
        },
        {
            original: "/examples/action-figure/original-3.webp",
            actionFigure: "/examples/action-figure/action-figure-3.webp",
            title: "TECHNOKING ELON",
            tagline: "One Tweet Away from Mars!",
            accessories: "a miniature Cybertruck, a Boring Company flamethrower, a Mars surface map, a Tesla battery pack, and an 'X' control panel"
        },
        {
            original: "/examples/action-figure/original-4.webp",
            actionFigure: "/examples/action-figure/action-figure-4.webp",
            title: "GATES OF GENIUS",
            tagline: "CODE. CURE. CONQUER.",
            accessories: "a pair of iconic glasses, a vintage Windows monitor labeled 'Windows 95', a syringe representing medical research, a philanthropic donation jar, and a chalkboard reading 'How to Solve Global Warming'"
        }
    ]

    // 创建提示词模板生成函数
    const generatePromptFromInputs = () => {

        return `Transform the uploaded photo into a full-body action figure toy that captures the key facial and body features of the original person 
with a semi-realistic 3D toy style. Render the figure using realistic detailing and proportions while maintaining a collectible toy look with smooth, 
plastic textures. Display the figure in a photorealistic, retail-grade 3D style with meticulously detailed, 
high-quality blister pack packaging that mimics real collectible products, featuring the title "${title}" and the tagline "${tagline}". 
Additionally, the packaging must include the following accessories: ${accessories}. 
Each accessory should be rendered exactly once and positioned clearly on either the left or right side of the figure, without overlapping it, 
following authentic retail action figure design.`

        return `Transform the uploaded photo into a full-body action figure toy that balances a 
        playful 3D cartoonish style with subtle realistic details, 
        ensuring that key facial and body characteristics from the original image remain easily recognizable. 
        Render the figure with toy-like proportions and a clear 3D form, 
        so it looks like a collectible toy rather than a hyper-realistic human, 
        yet preserves the essence of the original person. 
        Display the figure in a photorealistic, retail-grade 3D style with meticulously detailed, 
        high-quality blister pack packaging that mimics real collectible products and 
        shows the title "${title}" and the tagline "${tagline}". Additionally, 
        the blister pack must include the following accessories: ${accessories}. 
        Each accessory should be rendered exactly once, positioned clearly and separately on either 
        the left or right side of the figure, without overlapping it or the figure, 
        following authentic retail action figure design.`

        // 第二种提示词
        return `Transform the uploaded photo into a full-body action figure toy with a stylized, 
        fun 3D cartoonish appearance and toy-like proportions that resemble a collectible toy rather than a hyperrealistic human. 
        Render the figure in a photorealistic, retail-grade 3D style with meticulously detailed, high-quality blister pack packaging, 
        similar to authentic toy products. 
        The packaging displays the title "${title}" and the tagline "${tagline}" clearly. 
        Additionally, the blister pack must include the following accessories: ${accessories}. 
        Each accessory should be rendered exactly once, positioned clearly and separately on either the left or right side of the figure, 
        without overlapping it or the figure, in line with genuine retail action figure design.`


    };

    // 初始化时随机选择一个示例
    useEffect(() => {
        handleRandomInputs();
    }, [])

    // 只在用户未登录时才检查免费使用次数
    useEffect(() => {
        if (!user) {
            checkFreeUsage().then((freeUsage) => {
                console.log('Free usage:', freeUsage);
                setFreeCredits(FREE_MAX_CREDITS - freeUsage);
            }).catch((error) => {
                console.error('Failed to check usage:', error);
                setFreeCredits(FREE_MAX_CREDITS);
            });
        }
    }, [user]);

    // 加载历史记录
    useEffect(() => {
        const savedHistory = localStorage.getItem('actionFigureImageHistory');
        if (savedHistory) {
            console.log('savedHistory:', savedHistory);
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
                    localStorage.setItem('actionFigureImageHistory', JSON.stringify(history));
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

    const handleRandomInputs = () => {
        const randomIndex = Math.floor(Math.random() * inspirationExamples.length);
        const example = inspirationExamples[randomIndex];
        setTitle(example.title);
        setTagline(example.tagline);
        setAccessories(example.accessories);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setImageUploading(true);
        try {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            // 始终只处理一张图片
            const file = files[0];

            // 检查文件类型
            if (!file.type.startsWith('image/')) {
                alert('Please upload image files only');
                setImageUploading(false);
                return;
            }

            // 检查文件大小（限制为5MB）
            if (file.size > 5 * 1024 * 1024) {
                alert('Image size should be less than 5MB');
                setImageUploading(false);
                return;
            }

            // 如果已经有上传的图片，先清除
            if (uploadedImages.length > 0) {
                setUploadedImages([]);
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    const img = document.createElement('img');
                    img.crossOrigin = 'anonymous'; // 处理跨域问题
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;

                        // 根据比例调整大图片的尺寸
                        if (width > 1024) {
                            height = Math.round((height * 1024) / width);
                            width = 1024;
                        }

                        // 创建canvas进行图片压缩处理
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0, width, height);
                            // 转换为WebP格式
                            const webpImage = canvas.toDataURL('image/webp');
                            // 添加到已上传图片数组
                            setUploadedImages([webpImage]);
                        }
                        canvas.remove();
                        img.remove();
                    };
                    img.src = event.target.result as string;
                }
            };
            reader.readAsDataURL(file);

            // 上传新图片时清除已生成的图片
            setGeneratedImage(null);
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
            setGeneratedImage(null);
        }

        // 清除文件输入框的值，避免相同文件不触发onChange事件
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeAllImages = () => {
        setUploadedImages([]);
        setGeneratedImage(null);
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
            alert('Please upload an image first');
            return;
        }

        // 根据登录状态决定走哪个逻辑
        if ((!user && freeCredits <= 0) || (user && credits <= 0)) {
            // 未登录用户且免费额度已用完，或者已登录用户且账户额度已用完，弹出升级提示
            setShowUpgradeModal(true);
            return;
        }

        // 还有点数的用户可以继续生成
        setShowTurnstile(true);
        setPendingGeneration(true);
    };

    const executeGeneration = async (token: string) => {
        if (uploadedImages.length === 0) return;

        setIsGenerating(true);
        setGenerationError('');
        setShowTurnstile(false);
        setPendingGeneration(false);

        // 生成完整提示词
        const fullPrompt = generatePromptFromInputs();

        try {
            const accessToken = await getAccessToken();

            const response = await fetch('/api/generate-image/create-task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    images: uploadedImages,
                    prompt: fullPrompt,
                    size: '2:3',
                    turnstileToken: token,
                    accessToken
                })
            });

            if (response.ok) {
                useOnce(); // 扣除积分点数
                const responseData = await response.json();

                // 保存任务ID和上传图片到localStorage
                localStorage.setItem('pendingTaskId', responseData.taskId);
                localStorage.setItem('pendingUploadedImages', JSON.stringify(uploadedImages));
                localStorage.setItem('pendingTitle', title);
                localStorage.setItem('pendingTagline', tagline);
                localStorage.setItem('pendingAccessories', accessories);
                startPollingTaskStatus(responseData.taskId);
            } else {
                const errorData = await response.json();
                taskFailed(errorData.error || 'Failed to create generation task');
            }
        } catch (error) {
            console.error('Error starting generation task:', error);
            taskFailed('An error occurred when creating generation task');
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
                console.log(`Check Task ${taskId} status, response: ${JSON.stringify(data)}`);

                if (data.status === 'SUCCESS') {
                    // Handle multiple generated images
                    const generatedImagesData = data.generatedImages || [];
                    if (generatedImagesData.length > 0) {
                        processGeneratedImage(generatedImagesData[0]); // 使用第一张生成的图片
                    } else if (data.generatedImage) {
                        // Compatibility with old API that returns a single image
                        processGeneratedImage(data.generatedImage);
                    } else {
                        taskFailed('Returned image data format error');
                    }
                } else if (data.status === 'GENERATING') {
                    // 仍在生成中，继续轮询
                } else {
                    // 生成失败或其他状态
                    taskFailed(data.message || 'Image generation failed');
                }
            } else {
                // API请求失败
                taskFailed('Failed to check task status');
            }
        } catch (error) {
            taskFailed(`Error checking task status: ${error}`);
        }
    };

    const processGeneratedImage = (imageUrl: string) => {
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
                setGeneratedImage(img_base64);

                // Get the current uploaded images and inputs
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

                const currentTitle = localStorage.getItem('pendingTitle') || title;
                const currentTagline = localStorage.getItem('pendingTagline') || tagline;
                const currentAccessories = localStorage.getItem('pendingAccessories') || accessories;

                addToHistory(currentUploadedImages, img_base64, currentTitle, currentTagline, currentAccessories);
            }
            canvas.remove();
            img.remove();

            stopPolling();
            setIsGenerating(false);
            // Clear localStorage temp data
            localStorage.removeItem('pendingTaskId');
            localStorage.removeItem('pendingUploadedImages');
            localStorage.removeItem('pendingTitle');
            localStorage.removeItem('pendingTagline');
            localStorage.removeItem('pendingAccessories');
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
        localStorage.removeItem('pendingTitle');
        localStorage.removeItem('pendingTagline');
        localStorage.removeItem('pendingAccessories');
        // 返还用户点数
    }

    // 停止轮询
    const stopPolling = () => {
        console.log(`Stopping polling, pollingInterval is: ${pollingIntervalRef.current}`);
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        setPendingGeneration(false);
    };

    const useOnce = () => {
        // 根据登录状态决定扣减哪个系统的点数
        if (!user) {
            // 未登录用户，扣减免费点数
            setFreeCredits(prev => prev - 1);
            useOneFreeGeneration();
        } else {
            // 已登录用户在后台自动扣除积分
        }
    }

    // 修改处理广告的函数
    const handleCloseAd = (isPreGenAd: boolean) => {
        if (isPreGenAd) {
            setShowPreGenAd(false);
            setPendingGeneration(false);
        } else {
            setShowPostGenAd(false);
            // 不移除模糊效果，因为用户没有查看广告
        }
    };

    const handleAdClick = async (isPreGenAd: boolean) => {
        // Open ad in new tab
        const currentWindow = window
        const newTab = window.open('https://povaique.top/4/9150862', '_blank', 'noopener noreferrer');
        if (newTab) {
            newTab.blur();
            currentWindow.focus();
        }

        if (isPreGenAd) {
            // Close pre-generation ad
            setShowPreGenAd(false);
            handleGenerateClick();
        } else {
            // Close post-generation ad and remove blur effect
            setShowPostGenAd(false);
            setIsResultBlurred(false);
            // Use first uploaded image when adding to history
            if (uploadedImages.length > 0) {
                addToHistory(uploadedImages, generatedImage);
            }
        }
    };

    const addToHistory = (originalImages: string[], actionFigureImage: string, titleText?: string, taglineText?: string, accessoriesText?: string) => {
        // Add to history record, including title, tagline and accessories
        const newHistoryItem: HistoryItem = {
            originalImages: originalImages,
            actionFigureImage: actionFigureImage,
            title: titleText || undefined,
            tagline: taglineText || undefined,
            accessories: accessoriesText || undefined,
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
            localStorage.removeItem('actionFigureImageHistory');
        }
    };

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

            <main className="pt-8">
                {/* 英雄区域 */}
                <div id="hero_containter" className='w-full flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12'>
                    {/* <div data-banner-id="1444036"></div> */}
                    <section className="w-full md:max-w-auto container mx-auto px-4 py-8 text-center">
                        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-[#1c4c3b]">Action Figure AI Generator</h1>
                        <p className="text-xl md:text-2xl text-[#506a3a] mb-6 max-w-3xl mx-auto">
                            Transform your photo into action figure in one click
                        </p>
                        <p className="text-md text-[#506a3a] mb-12 max-w-3xl mx-auto">
                            Powered by ChatGPT | The most advanced action figure AI generator for personal collectible transformations
                        </p>
                        <div className="bg-[#e7f0dc] p-6 rounded-xl max-w-5xl mx-auto shadow-lg border border-[#89aa7b]" id="tool-section">
                            <h2 className="text-2xl font-bold mb-6 text-[#1c4c3b]">AI-Powered Action Figure Generator</h2>

                            {/* 上传图片区域 - 移到提示词输入框上方 */}
                            <div className="mb-6">
                                <label htmlFor="upload-image-input" className="block text-[#1c4c3b] font-medium mb-2 text-left">Upload your photo</label>
                                <div className="p-4 border-2 border-dashed border-[#89aa7b] rounded-lg bg-white/90 text-center cursor-pointer" onClick={triggerFileInput}>
                                    <input
                                        id='upload-image-input'
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        title="Upload image"
                                        aria-label="Upload image"
                                    />

                                    {uploadedImages.length > 0 ? (
                                        <div className="relative max-h-64 overflow-hidden">
                                            <img
                                                src={uploadedImages[0]}
                                                alt="Uploaded image"
                                                className="mx-auto max-h-64 object-contain"
                                            />
                                            <div className="absolute bottom-0 right-0 m-2">
                                                <button
                                                    className="bg-white/80 p-1 rounded-full text-[#1c4c3b] hover:bg-white transition"
                                                    onClick={(e) => removeUploadedImage(0, e)}
                                                    title="Remove uploaded image"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#89aa7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="mt-4 text-[#506a3a]">Click to upload an image or drag & drop</p>
                                            <p className="text-sm text-[#506a3a] mt-1">PNG, JPG, WEBP up to 5MB</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 替换原有的提示词输入框为三个新的输入框 */}
                            <div className="mb-6">
                                <label htmlFor="title-input" className="block text-[#1c4c3b] font-medium mb-2 text-left">Title (e.g. "COSMIC EXPLORER")</label>
                                <input
                                    id="title-input"
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter action figure title..."
                                    className="w-full p-3 border border-[#89aa7b] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c4c3b]"
                                />
                            </div>

                            <div className="mb-6">
                                <label htmlFor="tagline-input" className="block text-[#1c4c3b] font-medium mb-2 text-left">Tagline (e.g. "MASTER OF THE UNIVERSE!")</label>
                                <input
                                    id="tagline-input"
                                    type="text"
                                    value={tagline}
                                    onChange={(e) => setTagline(e.target.value)}
                                    placeholder="Enter action figure tagline..."
                                    className="w-full p-3 border border-[#89aa7b] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1c4c3b]"
                                />
                            </div>

                            <div className="mb-6">
                                <label htmlFor="accessories-input" className="block text-[#1c4c3b] font-medium mb-2 text-left">Accessories (e.g. "a laser sword, a shield, a helmet, a space gun")</label>
                                <div className="flex gap-2">
                                    <textarea
                                        id="accessories-input"
                                        value={accessories}
                                        onChange={(e) => setAccessories(e.target.value)}
                                        placeholder="List accessories separated by commas..."
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
                                            onClick={handleRandomInputs}
                                            className="flex items-center justify-center gap-1 px-3 py-2 bg-[#89aa7b] text-white rounded-lg hover:bg-[#6d8c60] transition"
                                            title="Get random inputs"
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

                            {/* 按钮区域 */}
                            <div className="flex flex-col justify-center mb-6 gap-2">
                                <button
                                    className={`w-auto px-6 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition ${isGenerating || uploadedImages.length === 0 || pendingGeneration ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                    onClick={handleGenerateClick}
                                    disabled={isGenerating || uploadedImages.length === 0 || pendingGeneration}
                                >
                                    {isGenerating ? 'Generating...' : pendingGeneration ? 'Verifying...' : 'Generate Action Figure'}
                                </button>

                                {/* 只在未登录状态下显示免费点数提示 */}
                                {!user && (
                                    <p className="ml-4 text-sm text-[#506a3a]">Remaining Free Credits: {freeCredits} &nbsp;&nbsp;
                                        <button
                                            onClick={() => {
                                                console.log(`clicking  Add Credits button, current window.location.origin is: ${window.location.origin}`);
                                                setLoginModalRedirectTo(`${window.location.origin}/temp-purchase`)
                                                setIsLoginModalOpen(true); // 打开登录模态框
                                            }}
                                            className="text-[#1c4c3b] font-medium underline"
                                        >
                                            Add Credits
                                        </button>
                                    </p>
                                )}
                            </div>

                            <p className="text-sm text-[#506a3a] mt-4">
                                Powered by <span className="font-semibold">ChatGPT technology</span> | Fast, accurate action figure AI transformation
                            </p>
                        </div>
                    </section>
                    {/* <div data-banner-id="1444051"></div> */}
                </div>


                {/* 生成结果区域 */}
                {(isGenerating || generatedImage || generationError) && (
                    <section className="container mx-auto px-4 py-8">
                        <h2 className="text-2xl font-bold mb-6 text-center text-[#1c4c3b]">Your Action Figure AI Transformation</h2>

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

                        {generatedImage && uploadedImages.length > 0 && !isGenerating && (
                            <div className="max-w-4xl mx-auto relative">
                                {/* 添加模糊效果覆盖层 */}
                                {isResultBlurred && (
                                    <div className="absolute inset-0 backdrop-blur-md z-10 flex flex-col items-center justify-center gap-2">
                                        <div className="p-4 bg-white/70 rounded-lg shadow-lg">
                                            <p className="text-lg font-medium text-[#1c4c3b]">Your action figure is ready!</p>
                                        </div>
                                        <button
                                            className="bg-[#1c4c3b] text-white p-3 stext-sm rounded-lg hover:bg-[#2a6854] transition"
                                            onClick={() => setShowPostGenAd(true)}
                                        >
                                            Reveal Your Action Figure
                                        </button>
                                    </div>
                                )}
                                <ImageComparisonCard
                                    id="generated-image-comparison-card"
                                    data-type="generated-image-comparison-card"
                                    original={uploadedImages[0]}
                                    generate={generatedImage}
                                    tags={[
                                        ['Title', title],
                                        ['Tagline', tagline],
                                        ['Accessories', accessories]
                                    ]}
                                />
                            </div>
                        )}
                    </section>
                )}

                {/* 历史记录区域 - 更新展示内容 */}
                {history.length > 0 && (
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
                                    {item.originalImages && item.originalImages.length > 0 && item.actionFigureImage ? (
                                        <ImageComparisonCard
                                            id={`history-image-comparison-card-${index}`}
                                            data-type="history-image-comparison-card"
                                            original={item.originalImages[0]}
                                            generate={item.actionFigureImage}
                                            tags={[
                                                ['Title', item.title],
                                                ['Tagline', item.tagline],
                                                ['Accessories', item.accessories]
                                            ]}
                                        />
                                    ) : (
                                        <div className="flex">
                                            <div className="w-1/2 p-2">
                                                {item.originalImages && item.originalImages.length > 0 ? (
                                                    <img
                                                        src={item.originalImages[0]}
                                                        alt={`Original image`}
                                                        className="w-full h-auto object-cover rounded-lg"
                                                        onClick={() => handleImageClick(item.originalImages[0])}
                                                    />
                                                ) : (
                                                    <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                                                        <span className="text-gray-500">No original image</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="w-1/2 p-2">
                                                {item.actionFigureImage ? (
                                                    <img
                                                        src={item.actionFigureImage}
                                                        alt={`Action figure ${index + 1}`}
                                                        className="w-full h-auto object-cover rounded-lg"
                                                        onClick={() => handleImageClick(item.actionFigureImage)}
                                                    />
                                                ) : (
                                                    <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                                                        <span className="text-gray-500">No generated image</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 示例区域 - 更新展示内容 */}
                <section id="examples" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Action Figure AI Inspiration Gallery</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center">
                        Check out these examples from our action figure maker and use their details to create your own AI action figures
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
                        {inspirationExamples.map((example, index) => (
                            <div key={index} className="rounded-lg overflow-hidden shadow-md hover:shadow-xl transition border border-[#89aa7b]">
                                <div className="relative">
                                    <div className="flex">
                                        <div className="w-1/2 p-2">
                                            <img
                                                src={example.original}
                                                alt={`Original image ${index + 1}`}
                                                className="w-full h-auto object-cover rounded-lg"
                                                onClick={() => handleImageClick(example.original)}
                                            />
                                        </div>
                                        <div className="w-1/2 p-2">
                                            <img
                                                src={example.actionFigure}
                                                alt={`Action figure example ${index + 1}`}
                                                className="w-full h-auto object-cover rounded-lg"
                                                onClick={() => handleImageClick(example.actionFigure)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 bg-white">
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm text-[#506a3a]"><strong>Title:</strong> <span className='italic'>{example.title}</span></p>
                                        <p className="text-sm text-[#506a3a]"><strong>Tagline:</strong> <span className='italic'>{example.tagline}</span></p>
                                        <p className="text-sm text-[#506a3a]"><strong>Accessories:</strong> <span className='italic'>{example.accessories}</span></p>
                                        <button
                                            className="flex-shrink-0 p-2 bg-[#e7f0dc] text-[#1c4c3b] rounded-lg hover:bg-[#d5e6c3] transition flex items-center gap-1 self-end"
                                            onClick={() => {
                                                setTitle(example.title);
                                                setTagline(example.tagline);
                                                setAccessories(example.accessories);
                                                // 滚动到工具区域
                                                const toolSection = document.getElementById('tool-section');
                                                if (toolSection) {
                                                    toolSection.scrollIntoView({ behavior: 'smooth' });
                                                }
                                            }}
                                            title="Use these details"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                            </svg>
                                            <span className="text-xs">Apply</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 详细使用指南部分 - MOVED HERE */}
                <section id="how-to-use" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">How to Use Our Action Figure AI Generator</h2>
                    <p className="text-xl text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Follow these detailed steps to create your perfect action figure with our AI action figure maker
                    </p>

                    <div className="max-w-4xl mx-auto">
                        <div className="grid gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <div className="flex items-start">
                                    <div className="w-12 h-12 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                                        <span className="text-xl font-bold text-[#1c4c3b]">1</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Upload Your Photo to Our Action Figure AI</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Click on the upload area at the top of the action figure AI generator tool section. You can either drag and drop an image or click to browse your files.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            For best results with our action figure maker, choose a clear photo with good lighting where your face and body are clearly visible. Front-facing portraits work best for action figure AI transformations.
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
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Enter Your Prompt for the AI Action Figure Generator</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            If you already know what kind of action figure style you want, type your description directly in the prompt box. Be as specific as possible about the style, accessories, and details you'd like in your action figure AI creation.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Example: "Transform into a sci-fi bounty hunter action figure with battle-worn armor, laser rifle, and desert planet base."
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
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Get Inspiration for Your Action Figure AI Design</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            If you're not sure what prompt to use for our action figure maker, click the "Get Inspiration" button to browse our Inspiration Gallery. There you'll find many examples of action figure AI transformations with different styles and themes.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            When you find a style you like, simply click the "Apply" button next to the prompt. This will automatically copy the prompt to your input box and return you to the action figure AI generator tool section.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Alternatively, you can click the "Random" button to get a randomly selected prompt from our collection of effective action figure AI examples.
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
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Customize Your Action Figure AI Prompt</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Once you have a base prompt for our action figure maker (either from the gallery or your own), personalize it by modifying specific elements:
                                        </p>
                                        <ul className="list-disc pl-5 mb-3 space-y-2 text-[#506a3a]">
                                            <li><strong>Name:</strong> Change any character name to your own name or a character name you prefer in your action figure AI creation</li>
                                            <li><strong>Headline:</strong> Modify the title or description (e.g., "Galactic Warrior" to "Space Explorer")</li>
                                            <li><strong>Accessories:</strong> Update the accessories to match your interests (e.g., "sword" to "magic staff") for a personalized action figure AI</li>
                                            <li><strong>Style:</strong> Adjust the overall aesthetic (e.g., "modern" to "vintage 80s") for your custom action figure maker style</li>
                                            <li><strong>Packaging:</strong> Specify if you want packaging details (e.g., "with display case" or "in blister pack") for your AI action figure generator result</li>
                                        </ul>
                                        <p className="text-[#506a3a]">
                                            The more specific and personal your prompt, the more unique your action figure AI creation will be!
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
                                        <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Generate Your Action Figure with AI</h3>
                                        <p className="text-[#506a3a] mb-3">
                                            Once you're satisfied with your photo and prompt, click the "Create Action Figure" button to submit your generation task to our action figure AI generator.
                                        </p>
                                        <p className="text-[#506a3a] mb-3">
                                            The action figure maker process typically takes a few moments. During this time, you'll see a loading indicator - please be patient and do not refresh the page while the AI action figure generator is working.
                                        </p>
                                        <p className="text-[#506a3a]">
                                            Congratulations! Your personalized action figure AI creation will appear shortly. From there, you can view the before/after comparison and save your action figure AI masterpiece.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 添加关于Action Figure AI的介绍部分 */}
                <section id="about" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Exploring the Action Figure AI Revolution</h2>
                    <p className="text-lg text-[#506a3a] mb-10 text-center max-w-3xl mx-auto">
                        Transform your photos into collectible-worthy action figures with our cutting-edge AI action figure generator
                    </p>

                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <h3 className="text-2xl font-bold mb-4 text-[#1c4c3b]">Action Figure AI: The Latest Social Media Sensation</h3>
                            <p className="text-[#506a3a] mb-4">
                                The Action Figure AI transformation trend has taken social media by storm in recent months, with thousands of users turning their selfies and portraits into amazingly detailed collectible-style action figures using AI action figure generators.
                            </p>
                            <p className="text-[#506a3a] mb-4">
                                This trend gained significant momentum after several celebrities shared their AI-generated action figure transformations, quickly making action figure AI one of the most viral AI image transformations of the year.
                            </p>
                            <p className="text-[#506a3a]">
                                Unlike other AI image transformations, the action figure AI style creates a unique blend of realism and toyetic aesthetics, capturing people's imagination by turning them into the collectibles they grew up admiring with just one click of our action figure maker.
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                            <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Action Figure AI Style Characteristics:</h3>
                            <ul className="space-y-3">
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Plastic-like material texture with authentic joint articulation points typical of action figure AI creations</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Detailed costume elements with exaggerated proportions created by our AI action figure generator</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Optional packaging elements like blister packs or collector boxes in action figure maker style</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Recognizable facial features translated into toy-appropriate style by our action figure AI</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="w-5 h-5 bg-[#e7f0dc] rounded-full flex items-center justify-center mr-3 mt-1">
                                        <span className="w-2 h-2 bg-[#1c4c3b] rounded-full"></span>
                                    </span>
                                    <span className="text-[#506a3a]">Accessory items that complement the figure's theme in true action figure AI generator fashion</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* 补充功能区域 - WITH UPDATED SEO KEYWORDS */}
                <section id="features" className="bg-[#e7f0dc] py-16 mt-16">
                    <div className="container mx-auto px-4">
                        <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Why Choose Our Action Figure AI Generator</h2>
                        <p className="text-xl text-[#506a3a] mb-16 text-center max-w-3xl mx-auto">
                            Experience next-generation AI action figure maker technology - powerful, free, and fun to use
                        </p>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">ChatGPT-Powered</h3>
                                <p className="text-[#506a3a]">
                                    Our tool uses cutting-edge large language model technology to create incredibly detailed and accurate action figure transformations.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Authentic Toy Aesthetics</h3>
                                <p className="text-[#506a3a]">
                                    Creates action figures with realistic details like joint articulation, plastic sheen, and packaging that look just like real collectibles.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Customizable Styles</h3>
                                <p className="text-[#506a3a]">
                                    Use our prompt system to create figures in different styles from vintage 80s toys to modern premium collectibles.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Quick Processing</h3>
                                <p className="text-[#506a3a]">
                                    Our optimized AI system delivers high-quality action figure transformations in seconds, not minutes.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Privacy First</h3>
                                <p className="text-[#506a3a]">
                                    Your photos and generated images are processed securely and not stored permanently on our servers.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-4 text-[#1c4c3b]">Social Media Ready</h3>
                                <p className="text-[#506a3a]">
                                    Generated images are perfect for sharing on social platforms, with options to download in high resolution.
                                </p>
                            </div>
                        </div>

                        {/* 添加使用场景部分 */}
                        <div className="mt-16">
                            <h3 className="text-2xl font-bold mb-8 text-center text-[#1c4c3b]">Popular Use Cases</h3>
                            <div className="grid md:grid-cols-3 gap-8">
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Social Media Posts</h4>
                                    <p className="text-[#506a3a]">
                                        Create viral-worthy content by transforming yourself, friends, or celebrities into action figures that get massive engagement online.
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Personalized Gifts</h4>
                                    <p className="text-[#506a3a]">
                                        Generate custom action figure images of friends and family for unique birthday cards, invitations, or printed merchandise.
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                    <h4 className="text-xl font-bold mb-4 text-[#1c4c3b]">Creative Projects</h4>
                                    <p className="text-[#506a3a]">
                                        Game designers, writers, and marketers use our tool to visualize characters as action figures for concepts and presentations.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 新增 AI 行动人偶革命部分 */}
                <section className="container mx-auto px-4 py-16 bg-[#f9fbf6]">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Exploring the Action Figure AI Revolution</h2>
                        <p className="text-xl text-[#506a3a] mb-6">
                            The action figure AI trend has become incredibly popular for collectors, hobbyists, and anyone who wants to see themselves transformed into a miniature collectible masterpiece. Our advanced AI action figure generator uses cutting-edge technology to create stunningly detailed and personalized figures.
                        </p>

                        <div className="grid md:grid-cols-2 gap-8 mb-10">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">What Makes Action Figure AI Special</h3>
                                <ul className="list-disc pl-5 space-y-2 text-[#506a3a]">
                                    <li>Hyper-realistic detailing that mimics commercial-quality action figures</li>
                                    <li>Perfect joint articulation points characteristic of collectible figures</li>
                                    <li>Custom packaging design that resembles authentic toy packaging</li>
                                    <li>Personalized character design based on your specific prompts</li>
                                    <li>Multiple style options from retro 80s to modern high-detail figures</li>
                                </ul>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Why Use Our Action Figure Maker</h3>
                                <ul className="list-disc pl-5 space-y-2 text-[#506a3a]">
                                    <li>Most advanced action figure AI technology on the market</li>
                                    <li>Simple upload-and-generate process with fast results</li>
                                    <li>High-resolution output perfect for social media sharing</li>
                                    <li>Extensive prompt library for inspiration</li>
                                    <li>Creates unique collectible-style figures that preserve your likeness</li>
                                </ul>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b] mb-8">
                            <h3 className="text-xl font-bold mb-3 text-[#1c4c3b]">Popular Action Figure AI Styles</h3>
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
                            Our action figure AI generator is continuously improving with new features and styles. Try it today to see yourself transformed into a stunning collectible figure!
                        </p>
                    </div>
                </section>

                {/* FAQ 部分 - 增加SEO关键词 */}
                <section id="faq" className="container mx-auto px-4 py-16">
                    <h2 className="text-3xl font-bold mb-8 text-center text-[#1c4c3b]">Frequently Asked Questions About Action Figure AI</h2>

                    <div className="max-w-4xl mx-auto">
                        <div className="space-y-4">
                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">What exactly is an action figure AI generator?</h3>
                                <p className="text-[#506a3a]">
                                    An action figure AI generator is a specialized artificial intelligence tool that transforms regular photos into images that look like commercial action figures. Our AI action figure maker analyzes your photo and creates a highly detailed figure complete with articulation points, accessories, and even packaging style elements typical of collectible action figures.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">How realistic do the action figures from your AI action figure maker look?</h3>
                                <p className="text-[#506a3a]">
                                    Our action figure AI creates impressively realistic results that mimic commercial-quality action figures. The AI generates detailed textures, joint articulations, and accessories that make the figures look like they could be photographed on a store shelf. The quality depends somewhat on your original photo quality and the specificity of your prompt.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">Can I create action figures based on specific toy lines with your action figure AI?</h3>
                                <p className="text-[#506a3a]">
                                    Yes! Our AI action figure generator can create figures inspired by popular toy styles from different eras. You can specify styles like "80s GI Joe style," "modern Marvel Legends style," or "Japanese mecha style" in your prompts to guide the action figure AI toward a particular aesthetic. The more specific your description, the better the AI can match your desired style.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">How many free credits do I get with the action figure maker?</h3>
                                <p className="text-[#506a3a]">
                                    New users receive 3 free credits to try our action figure AI generator. Each credit allows you to create one AI action figure. After using your free credits, you can purchase additional credits or subscribe to our premium plan for unlimited access to our action figure maker and other AI transformation tools.
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-md border border-[#89aa7b]">
                                <h3 className="text-xl font-bold mb-2 text-[#1c4c3b]">Can I use the action figure AI images commercially?</h3>
                                <p className="text-[#506a3a]">
                                    Yes, all images created with our action figure maker are yours to use, including for commercial purposes. However, please be aware that if your prompts reference specific trademarked characters or brands, the resulting images may have copyright implications that you should consider before commercial use.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 创作者声明部分 */}
                <section className="container mx-auto px-4 py-16 bg-[#f9fbf6]">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl font-bold mb-8 text-[#1c4c3b]">Create Your Personalized Action Figure Today</h2>
                        <p className="text-xl text-[#506a3a] mb-8">
                            Our action figure AI generator makes it easy to transform photos into incredible collectible-style figures. Whether you're creating a gift, a social media post, or just having fun, our AI action figure maker delivers high-quality results every time.
                        </p>
                        <button
                            onClick={() => {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="px-8 py-3 bg-[#1c4c3b] text-white text-lg rounded-lg hover:bg-[#2a6854] transition"
                        >
                            Start Creating Your Action Figure
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default ActionFigureAI; 