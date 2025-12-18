// 设置遮罩层
function setMask() {
    if (document.getElementsByClassName("rmMask")[0] != undefined)
        return document.getElementsByClassName("rmMask")[0];
    mask = document.createElement('div');
    mask.className = "rmMask";
    mask.style.width = window.innerWidth + 'px';
    mask.style.height = window.innerHeight + 'px';
    mask.style.background = '#fff';
    mask.style.opacity = '.0';
    mask.style.position = 'fixed';
    mask.style.top = '0';
    mask.style.left = '0';
    mask.style.zIndex = 99998;
    document.body.appendChild(mask);
    return mask;
}

function insertAtCursor(myField, myValue) {
    if (document.selection) {
        myField.focus();
        sel = document.selection.createRange();
        sel.text = myValue;
        sel.select();
    } else if (myField.selectionStart || myField.selectionStart == '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        var restoreTop = myField.scrollTop;
        myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
        if (restoreTop > 0) {
            myField.scrollTop = restoreTop;
        }
        myField.focus();
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
    } else {
        myField.value += myValue;
        myField.focus();
    }
}

let rmf = {};
rmf.showRightMenu = function (isTrue, x = 0, y = 0) {
    let $rightMenu = $('#rightMenu');
    $rightMenu.css('top', x + 'px').css('left', y + 'px');
    if (isTrue) {
        $rightMenu.show();
    } else {
        $rightMenu.hide();
    }
}

rmf.copyWordsLink = function () {
    let url = window.location.href
    let txa = document.createElement("textarea");
    txa.value = url;
    document.body.appendChild(txa)
    txa.select();
    document.execCommand("Copy");
    document.body.removeChild(txa);
    btf.snackbarShow('复制成功');
}

rmf.switchReadMode = function () {
    const $body = document.body
    $body.classList.add('read-mode')
    const newEle = document.createElement('button')
    newEle.type = 'button'
    newEle.className = 'fas fa-sign-out-alt exit-readmode'
    $body.appendChild(newEle)

    function clickFn() {
        $body.classList.remove('read-mode')
        newEle.remove()
        newEle.removeEventListener('click', clickFn)
    }
    newEle.addEventListener('click', clickFn)
}

rmf.copySelect = function () {
    document.execCommand('Copy', false, null);
    btf.snackbarShow('复制成功');
}

rmf.scrollToTop = function () {
    btf.scrollToDest(0, 500);
}

function popupMenu() {
    window.oncontextmenu = function (event) {
        if (mouseMode == "off") return true;

        $('.rightMenu-group.hide').hide();
        if (document.getSelection().toString()) {
            $('#menu-text').show();
        }
        if (document.getElementById('post')) {
            $('#menu-post').show();
        } else {
            if (document.getElementById('page')) {
                $('#menu-post').show();
            }
        }
        var el = event.target;
        var a = /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\*\+,;=.]+$/
        if (a.test(window.getSelection().toString()) && el.tagName != "A") {
            $('#menu-too').show()
        }
        if (el.tagName == 'A') {
            $('#menu-to').show()
            rmf.open = function () {
                if (el.href.indexOf("http://") == -1 && el.href.indexOf("https://") == -1 || el.href.indexOf("yisous.xyz") != -1) {
                    pjax.loadUrl(el.href)
                } else {
                    location.href = el.href
                }
            }
            rmf.openWithNewTab = function () {
                window.open(el.href);
            }
            rmf.copyLink = function () {
                let url = el.href
                let txa = document.createElement("textarea");
                txa.value = url;
                document.body.appendChild(txa)
                txa.select();
                document.execCommand("Copy");
                document.body.removeChild(txa);
                btf.snackbarShow('链接复制成功');
            }
        } else if (el.tagName == 'IMG') {
            $('#menu-img').show()
            rmf.openWithNewTab = function () {
                window.open(el.src);
            }
            rmf.click = function () {
                el.click()
            }
            rmf.copyLink = function () {
                let url = el.src
                let txa = document.createElement("textarea");
                txa.value = url;
                document.body.appendChild(txa)
                txa.select();
                document.execCommand("Copy");
                document.body.removeChild(txa);
                btf.snackbarShow('图片链接复制成功');
            }
            rmf.saveAs = function () {
                var a = document.createElement('a');
                var url = el.src;
                var filename = url.split("/")[-1];
                a.href = url;
                a.download = filename;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } else if (el.tagName == "TEXTAREA" || el.tagName == "INPUT") {
            $('#menu-paste').show();
            rmf.paste = function () {
                // 兼容性写法，使用 Butterfly 自带的 snackbar 替代原有的 Snackbar.show
                if (navigator.clipboard) {
                    navigator.clipboard.readText().then(text => {
                        insertAtCursor(el, text)
                        btf.snackbarShow('粘贴成功');
                    }).catch(err => {
                        btf.snackbarShow('读取剪贴板失败，请允许权限');
                    });
                } else {
                    btf.snackbarShow('浏览器不支持自动读取剪贴板');
                }
            }
        }
        let pageX = event.clientX + 10;
        let pageY = event.clientY;
        let rmWidth = $('#rightMenu').width();
        let rmHeight = $('#rightMenu').height();
        if (pageX + rmWidth > window.innerWidth) {
            pageX -= rmWidth + 10;
        }
        if (pageY + rmHeight > window.innerHeight) {
            pageY -= pageY + rmHeight - window.innerHeight;
        }
        mask = setMask();
        window.onclick = () => {
            $('.rmMask').attr('style', 'display: none');
            mask.remove(); // 移除遮罩
        }
        rmf.showRightMenu(true, pageY, pageX);
        $('.rmMask').attr('style', 'display: flex');
        return false;
    };

    window.addEventListener('click', function () {
        rmf.showRightMenu(false);
    });
}
if (!(navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i))) {
    popupMenu()
}
const box = document.documentElement

function addLongtabListener(target, callback) {
    let timer = 0
    target.ontouchstart = () => {
        timer = 0
        timer = setTimeout(() => {
            callback();
            timer = 0
        }, 380)
    }
    target.ontouchmove = () => {
        clearTimeout(timer)
        timer = 0
    }
    target.ontouchend = () => {
        if (timer) {
            clearTimeout(timer)
        }
    }
}

addLongtabListener(box, popupMenu)

rmf.fullScreen = function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
}

// 右键开关逻辑优化
if (localStorage.getItem("mouse") == undefined) {
    localStorage.setItem("mouse", "on");
}
var mouseMode = localStorage.getItem("mouse");

function changeMouseMode() {
    // 移除 Vue 和 debounce 依赖，直接使用原生逻辑
    if (localStorage.getItem("mouse") == "on") {
        mouseMode = "off";
        localStorage.setItem("mouse", "off");
        btf.snackbarShow('当前鼠标右键已恢复为系统默认！');
    } else {
        mouseMode = "on";
        localStorage.setItem("mouse", "on");
        btf.snackbarShow('当前鼠标右键已更换为网站指定样式！');
    }
}