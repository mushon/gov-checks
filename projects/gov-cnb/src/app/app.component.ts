import { AfterViewInit, Component, ElementRef, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { delay, filter, first, fromEvent, interval, map, switchMap, take, tap, throttleTime, timer } from 'rxjs';
import { DataService } from './data.service';
import { StagesComponent } from './stages/stages.component';
import { Step, Country, Slide, Bill } from './types';

import { marked } from 'marked';
import { MarkdownService } from './markdown.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Route } from '@angular/router';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less'],
  host: {
    '[class.active]': 'active'
  }
})
export class AppComponent implements AfterViewInit {

  @ViewChild('stages') stages: StagesComponent;
  @ViewChild('slidesContainer') slidesContainer: ElementRef<HTMLElement>;
  @ViewChild('title') titleImg: ElementRef<HTMLElement>;
  @ViewChildren('steptext') stepTexts: QueryList<ElementRef<HTMLElement>>;

  marked = marked;

  countries: Country[];
  steps: Step[];
  slides: Slide[];
  bills: Bill[];
  content: any = {};
  
  observer: IntersectionObserver;
  activeObserver: IntersectionObserver;

  currentSlide = 0;
  currentStepIndex = -1;
  twitterShare: SafeUrl;
  fbShare: SafeUrl;
  whatsappShare: SafeUrl;
  scrolledOnce = false;
  shareData: { text: any; url: string; };
  active = true;
  activeCount: number = 0;

  constructor(private data: DataService, private el: ElementRef, public md: MarkdownService, private sanitizer: DomSanitizer, private route: ActivatedRoute) {
    // Marked.js options
    const renderer = new marked.Renderer();
    const linkRenderer = renderer.link;
    renderer.link = (href, title, text) => {
      const localLink = (href || '').startsWith(`${location.protocol}//${location.hostname}`);
      const html = linkRenderer.call(renderer, href, title, text);
      return localLink ? html : html.replace(/^<a /, `<a target="_blank" rel="noreferrer noopener nofollow" `);
    };
    renderer.codespan = (code: string) => {
      const splitPoint = code.indexOf(' ');
      return `<span class="step-number">${code.slice(0, splitPoint)}</span><span class="step-title">${code.slice(splitPoint + 1)}</span>`;
    };
    marked.use({renderer});

  }

  prepareShare() {
    const shareText = this.content.shareText;
    const url = 'https://save-democracy.berl.org.il/';
    this.shareData = {
      text: shareText,
      url
    };
    this.twitterShare = this.sanitizer.bypassSecurityTrustUrl(`http://twitter.com/share?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`);
    this.fbShare = this.sanitizer.bypassSecurityTrustUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    this.whatsappShare = this.sanitizer.bypassSecurityTrustUrl(`https://wa.me/?text=${encodeURIComponent(shareText)} ${encodeURIComponent(url)}`);
  }

  ngAfterViewInit() {
    this.data.data.pipe(
      tap(data => {
        this.countries = data.countries;
        this.steps = data.steps;
        this.slides = data.slides;
        this.bills = data.bills;
        this.content = data.content;
        this.slides.forEach((slide, i) => {
          slide.textHtml = this.md._(slide.text);
        });
        this.prepareShare();
      }),
      delay(50),
      // switchMap(() => 
      //   interval(10000).pipe(
      //     filter(x => !!x),
      //     take(this.steps.length),
      //     map(x => this.steps[x-1]),
      //     tap(step => {
      //       this.stages.goto(step);
      //     }),
      //     delay(1000),
      //     tap(() => {
      //       console.log('highlight', this.countries[0].display);
      //       this.stages.highlight(this.countries[0]);
      //     })    
      //   )
      // )
      tap(() => {
        this.setupObserver();
        const content = this.slidesContainer.nativeElement.querySelector('.slide:first-child > *:first-child') as HTMLElement;
        const titleEl = this.titleImg.nativeElement as HTMLImageElement;
        titleEl.style.top = (content.getBoundingClientRect().top - 145 + window.scrollY) + 'px';
        titleEl.style.display = 'block';
        this.resetScrolledOnce();
      }),
      delay(1000),
      switchMap(() => this.route.fragment),
      first(),
      tap((fragment) => {
        if (fragment === 'outro') {
          this.scrollMore('#outro');
        }
      })
    ).subscribe();
  }  

  resetScrolledOnce() {
    this.scrolledOnce = window.scrollY > 100;
    fromEvent<MouseEvent>(this.el.nativeElement, 'scroll', ).pipe(
      filter((e: Event) => {
        const top = (e.target as HTMLElement).scrollTop;
        return top > 100;
      }),
      first(),
      tap(() => {
        this.scrolledOnce = true;
      }),
      delay(100)
    ).subscribe(() => {
      this.el.nativeElement.querySelectorAll('.share, .footer').forEach((el: HTMLElement) => {
        console.log('active observer', el);
        this.activeObserver.observe(el);
      });    
    });
  }

  reset() {
    timer(3000).subscribe(() => {
      this.resetScrolledOnce();
      this.stages.reset();
    });
  }

  setupObserver() {
    this.observer = new IntersectionObserver((entries) => {
      for (let entry of entries) {
        let slideIdx_ = entry.target.getAttribute('data-slide-idx');
        if (!slideIdx_) continue;
        const slideIdx = parseInt(slideIdx_, 10);
        if (entry.isIntersecting) {
          this.currentSlide = slideIdx;
          const slide: Slide = this.slides[this.currentSlide];
          const step: Step | undefined = slide.step;
          if (step) {
            console.log('goto', step.name);
            this.currentStepIndex = this.steps.indexOf(step);
            this.highlightStepText();
            this.stages.goto(step);
            this.stages.setLastSlide(slideIdx === this.slides.length - 1);
            this.stages.highlight(slide.highlight_country);
          }
        }
      }
    }, {threshold: 0.55});
    this.el.nativeElement.querySelectorAll('.slide').forEach((el: HTMLElement) => {
      this.observer.observe(el);
    });
    this.activeObserver = new IntersectionObserver((entries) => {
      console.log('active', entries)
      entries.forEach((e) => {
        console.log('active', e);
        if (e.isIntersecting) {
          this.activeCount += 1;
        } else {
          this.activeCount -= 1;
        }
      });
      if (this.activeCount < 0) this.activeCount = 0;
      this.active = this.activeCount === 0;
      console.log('active', this.activeCount, this.active);
      this.stages.setActive(this.active);
    }, {threshold: 0});
  }

  highlightStepText() {
    return;
    // const el = this.stepTexts.toArray()[this.currentStepIndex].nativeElement;
    // const left = el.offsetLeft;
    // const right = left + el.offsetWidth;
    // const parent = el.offsetParent as HTMLElement;
    // if (parent.scrollLeft > left) {
    //   parent.scrollTo({left, behavior: 'smooth'});
    // } else if (parent.scrollLeft + parent.offsetWidth < right) {
    //   parent.scrollTo({left: right - parent.offsetWidth, behavior: 'smooth'});
    // }
  }

  scrollMore(selector: string) {
    const el = (this.el.nativeElement as HTMLElement).querySelector(selector) as HTMLElement;
    el.scrollIntoView({behavior: 'smooth', 'block': 'nearest'});
  }

  async mobileShare() {
    try {
        await navigator.share(this.shareData);
    } catch (err) {
      console.log('Failed to share', err);
    }
  }
}
