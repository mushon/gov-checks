import { ElementRef } from "@angular/core";
import { Country } from "../types";

export interface IStage {
    reveal(): void;      
    selectCountries(countries: Country[]): void;
    get el(): ElementRef;
};